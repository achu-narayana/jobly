import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { buildGraph } from "./graph.js";
import { scoreLead } from "./match.js";
import { buildProfile, extractText } from "./resume.js";
import { searchLinkedIn, searchRemoteOk, searchV2ex, type RawLead } from "./sources.js";
import { db, emptyOverlay, persist } from "./store.js";
import type { GraphLink, GraphNode, Lead, LeadStatus, ScanRequest, Source } from "./types.js";

const app = new Hono().basePath("/api");
app.use("*", cors());

// ------------------------------------------------------------------ profile

app.get("/profile", (c) => c.json(db.profile));

app.post("/resume", async (c) => {
  const body = await c.req.parseBody();
  const file = body["file"];
  if (!(file instanceof File)) return c.json({ error: "Upload a PDF, DOCX or TXT as `file`" }, 400);
  const buf = Buffer.from(await file.arrayBuffer());
  let text: string;
  try {
    text = await extractText(file.name, buf);
  } catch (e) {
    return c.json({ error: `Could not read ${file.name}: ${(e as Error).message}` }, 422);
  }
  if (text.trim().length < 40) return c.json({ error: "That file has almost no text. Is it a scanned image?" }, 422);
  db.profile = buildProfile(file.name, text);
  // Re-score existing leads against the new resume.
  for (const lead of db.leads) lead.match = scoreLead(db.profile, lead);
  persist();
  return c.json(db.profile);
});

app.put("/profile", async (c) => {
  if (!db.profile) return c.json({ error: "No profile yet" }, 404);
  const patch = (await c.req.json()) as Partial<typeof db.profile>;
  db.profile = { ...db.profile, ...patch, updatedAt: new Date().toISOString() };
  for (const lead of db.leads) lead.match = scoreLead(db.profile, lead);
  persist();
  return c.json(db.profile);
});

// ------------------------------------------------------------------ leads

app.get("/leads", (c) => c.json(db.leads));

app.patch("/leads/:id", async (c) => {
  const lead = db.leads.find((l) => l.id === c.req.param("id"));
  if (!lead) return c.json({ error: "not found" }, 404);
  const patch = (await c.req.json()) as { status?: LeadStatus; notes?: string };
  if (patch.status) lead.status = patch.status;
  if (typeof patch.notes === "string") lead.notes = patch.notes;
  persist();
  return c.json(lead);
});

app.delete("/leads/:id", (c) => {
  db.leads = db.leads.filter((l) => l.id !== c.req.param("id"));
  persist();
  return c.body(null, 204);
});

app.delete("/leads", (c) => {
  db.leads = [];
  persist();
  return c.body(null, 204);
});

// ------------------------------------------------------------------ scan (SSE)

type Task = { source: Source; query: string; location: string | null; run: () => Promise<RawLead[]> };

function planTasks(req: ScanRequest): Task[] {
  const tasks: Task[] = [];
  const locations = req.locations.length ? req.locations : [null];
  for (const query of req.queries) {
    if (req.sources.includes("linkedin"))
      for (const loc of locations)
        tasks.push({ source: "linkedin", query, location: loc, run: () => searchLinkedIn(query, loc, req.limit) });
    if (req.sources.includes("remoteok"))
      tasks.push({ source: "remoteok", query, location: null, run: () => searchRemoteOk(query, req.limit) });
    if (req.sources.includes("v2ex"))
      tasks.push({ source: "v2ex", query, location: null, run: () => searchV2ex(query, req.limit) });
  }
  return tasks;
}

app.get("/scan", (c) => {
  const q = c.req.query();
  const req: ScanRequest = {
    queries: (q.queries ?? "").split("|").map((s) => s.trim()).filter(Boolean).slice(0, 6),
    locations: (q.locations ?? "").split("|").map((s) => s.trim()).filter(Boolean).slice(0, 4),
    sources: ((q.sources ?? "linkedin").split(",") as Source[]).filter((s) => ["linkedin", "remoteok", "v2ex"].includes(s)),
    limit: Math.min(25, Math.max(1, Number(q.limit ?? 10))),
  };
  if (!req.queries.length) return c.json({ error: "queries required" }, 400);

  const tasks = planTasks(req);
  return streamSSE(c, async (stream) => {
    let done = 0;
    let added = 0;
    const send = (event: string, data: unknown) => stream.writeSSE({ event, data: JSON.stringify(data) });
    await send("start", { total: tasks.length, tasks: tasks.map(({ source, query, location }) => ({ source, query, location })) });

    const CONCURRENCY = 3;
    const queue = [...tasks];
    const worker = async () => {
      while (queue.length) {
        const task = queue.shift()!;
        const label = `${task.source} · ${task.query}${task.location ? ` · ${task.location}` : ""}`;
        await send("task", { label, state: "running" });
        try {
          const raws = await task.run();
          for (const raw of raws) {
            const existing = db.leads.find((l) => l.id === raw.id);
            if (existing) {
              existing.text = raw.text || existing.text;
              existing.fetchedAt = raw.fetchedAt;
              existing.match = scoreLead(db.profile, existing);
              await send("lead", { lead: existing, isNew: false });
              continue;
            }
            const lead: Lead = { ...raw, status: "new", notes: "", match: scoreLead(db.profile, raw) };
            db.leads.unshift(lead);
            added++;
            await send("lead", { lead, isNew: true });
          }
          persist();
          await send("task", { label, state: "done", count: raws.length });
        } catch (e) {
          await send("task", { label, state: "error", error: (e as Error).message });
        }
        done++;
        await send("progress", { done, total: tasks.length, added });
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, worker));
    await send("done", { added, total: db.leads.length });
  });
});

// ------------------------------------------------------------------ graph

app.get("/graph", (c) => c.json(buildGraph(db)));
app.get("/graph/overlay", (c) => c.json(db.overlay));

app.post("/graph/edit", async (c) => {
  const op = (await c.req.json()) as
    | { op: "removeNode"; id: string }
    | { op: "removeLink"; source: string; target: string }
    | { op: "rename"; id: string; label: string }
    | { op: "pin"; id: string; fx: number; fy: number; fz: number }
    | { op: "unpin"; id: string }
    | { op: "addNode"; node: GraphNode }
    | { op: "addLink"; link: GraphLink }
    | { op: "restore"; id: string }
    | { op: "reset" };
  const o = db.overlay;
  switch (op.op) {
    case "removeNode":
      if (!o.removedNodes.includes(op.id)) o.removedNodes.push(op.id);
      o.customNodes = o.customNodes.filter((n) => n.id !== op.id);
      break;
    case "removeLink": {
      const key = `${op.source}->${op.target}`;
      if (!o.removedLinks.includes(key)) o.removedLinks.push(key);
      o.customLinks = o.customLinks.filter((l) => `${l.source}->${l.target}` !== key);
      break;
    }
    case "rename":
      o.renamed[op.id] = op.label;
      break;
    case "pin":
      o.pinned[op.id] = { fx: op.fx, fy: op.fy, fz: op.fz };
      break;
    case "unpin":
      delete o.pinned[op.id];
      break;
    case "addNode":
      o.customNodes = [...o.customNodes.filter((n) => n.id !== op.node.id), op.node];
      o.removedNodes = o.removedNodes.filter((id) => id !== op.node.id);
      break;
    case "addLink": {
      const key = `${op.link.source}->${op.link.target}`;
      o.customLinks = [...o.customLinks.filter((l) => `${l.source}->${l.target}` !== key), op.link];
      o.removedLinks = o.removedLinks.filter((k) => k !== key);
      break;
    }
    case "restore":
      o.removedNodes = o.removedNodes.filter((id) => id !== op.id);
      break;
    case "reset":
      db.overlay = emptyOverlay();
      break;
  }
  persist();
  return c.json(buildGraph(db));
});

// ------------------------------------------------------------------ health

app.get("/health", (c) => c.json({ ok: true, leads: db.leads.length, profile: !!db.profile }));

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => console.log(`jobly api  →  http://localhost:${port}/api`));
