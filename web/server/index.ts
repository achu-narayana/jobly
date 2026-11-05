import { serve } from "@hono/node-server";
import { mkdirSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { discoverFunding, enrichStartup, LOCATION_TERMS, scoreStartup, startupFromHit } from "./funding.js";
import { buildGraph } from "./graph.js";
import { checkReplies, composeOutreach, newOutreach, sendOutreach, verifyMail } from "./mail.js";
import { scoreLead } from "./match.js";
import { buildProfile, extractText } from "./resume.js";
import { searchLinkedIn, searchRemoteOk, searchV2ex, type RawLead } from "./sources.js";
import { DATA_DIR, db, emptyOverlay, persist } from "./store.js";
import type { GraphLink, GraphNode, Lead, LeadStatus, MailSettings, ScanRequest, Source, StartupStatus } from "./types.js";

const app = new Hono().basePath("/api");
app.use("*", cors());

const rescoreAll = () => {
  for (const lead of db.leads) lead.match = scoreLead(db.profile, lead);
  for (const s of db.startups) s.match = scoreStartup(db.profile, s, s.description);
};

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
  // Keep the original so outreach can attach it.
  mkdirSync(DATA_DIR, { recursive: true });
  const stored = join(DATA_DIR, `resume${extname(file.name).toLowerCase() || ".txt"}`);
  writeFileSync(stored, buf);
  db.profile = { ...buildProfile(file.name, text), storedFile: stored };
  rescoreAll();
  persist();
  return c.json(db.profile);
});

app.put("/profile", async (c) => {
  if (!db.profile) return c.json({ error: "No profile yet" }, 404);
  const patch = (await c.req.json()) as Partial<typeof db.profile>;
  db.profile = { ...db.profile, ...patch, updatedAt: new Date().toISOString() };
  rescoreAll();
  persist();
  return c.json(db.profile);
});

// ------------------------------------------------------------------ settings

const maskMail = (m: MailSettings | null) => (m ? { ...m, pass: m.pass ? "••••••••" : "" } : null);

app.get("/settings", (c) => c.json({ ...db.settings, mail: maskMail(db.settings.mail), locationPresets: Object.keys(LOCATION_TERMS) }));

app.put("/settings", async (c) => {
  const patch = (await c.req.json()) as { locations?: string[]; mail?: MailSettings | null };
  if (patch.locations) db.settings.locations = patch.locations.slice(0, 12);
  if (patch.mail !== undefined) {
    if (patch.mail === null) db.settings.mail = null;
    else {
      const keepPass = patch.mail.pass === "••••••••" || !patch.mail.pass ? (db.settings.mail?.pass ?? "") : patch.mail.pass;
      db.settings.mail = { ...patch.mail, pass: keepPass, smtpPort: Number(patch.mail.smtpPort), imapPort: Number(patch.mail.imapPort) };
    }
  }
  persist();
  return c.json({ ...db.settings, mail: maskMail(db.settings.mail), locationPresets: Object.keys(LOCATION_TERMS) });
});

app.post("/settings/mail/test", async (c) => {
  if (!db.settings.mail) return c.json({ error: "Mail is not configured" }, 400);
  return c.json(await verifyMail(db.settings.mail));
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

// ------------------------------------------------------------------ job scan (SSE)

type Task = { source: Source; query: string; location: string | null; run: () => Promise<RawLead[]> };

function planTasks(req: ScanRequest): Task[] {
  const tasks: Task[] = [];
  const locations = req.locations.length ? req.locations : [null];
  for (const query of req.queries) {
    if (req.sources.includes("linkedin"))
      for (const loc of locations)
        tasks.push({ source: "linkedin", query, location: loc, run: () => searchLinkedIn(query, loc === "Remote" ? null : loc, req.limit) });
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
    locations: (q.locations ?? "").split("|").map((s) => s.trim()).filter(Boolean).slice(0, 6),
    sources: ((q.sources ?? "linkedin").split(",") as Source[]).filter((s) => ["linkedin", "remoteok", "v2ex"].includes(s)),
    limit: Math.min(25, Math.max(1, Number(q.limit ?? 10))),
  };
  if (!req.queries.length) return c.json({ error: "queries required" }, 400);

  const tasks = planTasks(req);
  return streamSSE(c, async (stream) => {
    let done = 0;
    let added = 0;
    const send = (event: string, data: unknown) => stream.writeSSE({ event, data: JSON.stringify(data) });
    await send("start", { total: tasks.length });

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
    await Promise.all(Array.from({ length: Math.min(3, tasks.length) }, worker));
    await send("done", { added, total: db.leads.length });
  });
});

// ------------------------------------------------------------------ funded startups

app.get("/startups", (c) => c.json(db.startups));

app.patch("/startups/:id", async (c) => {
  const s = db.startups.find((x) => x.id === c.req.param("id"));
  if (!s) return c.json({ error: "not found" }, 404);
  const patch = (await c.req.json()) as { status?: StartupStatus; notes?: string; emails?: string[]; website?: string | null };
  if (patch.status) s.status = patch.status;
  if (patch.website !== undefined) {
    s.website = patch.website ? (patch.website.startsWith("http") ? patch.website : `https://${patch.website}`).replace(/\/$/, "") : null;
    s.websiteManual = !!patch.website;
    s.enriched = false;
    s.enrichError = null;
  }
  if (typeof patch.notes === "string") s.notes = patch.notes;
  if (patch.emails) s.emails = patch.emails.map((address) => ({ address, source: s.emails.find((e) => e.address === address)?.source ?? "found" }));
  persist();
  return c.json(s);
});

app.post("/startups/:id/enrich", async (c) => {
  const s = db.startups.find((x) => x.id === c.req.param("id"));
  if (!s) return c.json({ error: "not found" }, 404);
  s.enriched = false;
  if (!s.websiteManual) s.website = null; // look the site up again
  await enrichStartup(s, db.profile);
  persist();
  return c.json(s);
});

app.delete("/startups/:id", (c) => {
  db.startups = db.startups.filter((x) => x.id !== c.req.param("id"));
  persist();
  return c.body(null, 204);
});

/**
 * Streams: news (headlines found) → startup (each company as it is enriched) → done.
 * Query: locations=Hyderabad|Remote  days=30  limit=12  (limit = companies enriched per location)
 */
app.get("/startups/scan", (c) => {
  const q = c.req.query();
  const locations = (q.locations ?? "").split("|").map((s) => s.trim()).filter(Boolean).slice(0, 6);
  const days = Math.min(90, Math.max(7, Number(q.days ?? 30)));
  const limit = Math.min(30, Math.max(1, Number(q.limit ?? 12)));
  const locs: (string | null)[] = locations.length ? locations : [null];

  return streamSSE(c, async (stream) => {
    const send = (event: string, data: unknown) => stream.writeSSE({ event, data: JSON.stringify(data) });
    let added = 0;
    let enriched = 0;
    const toEnrich: ReturnType<typeof startupFromHit>[] = [];
    await send("start", { locations: locs.map((l) => l ?? "Anywhere"), days });

    for (const loc of locs) {
      const label = loc ?? "Anywhere";
      await send("task", { label, state: "running" });
      try {
        const hits = await discoverFunding(loc, days);
        let fresh = 0;
        for (const hit of hits) {
          const s = startupFromHit(hit, loc, db.profile);
          const existing = db.startups.find((x) => x.id === s.id);
          if (existing) {
            // Retry companies whose site lookup failed last time.
            if (!existing.enriched || existing.enrichError) toEnrich.push(existing);
            continue;
          }
          db.startups.unshift(s);
          added++;
          fresh++;
          if (toEnrich.filter((x) => x.location === s.location).length < limit) toEnrich.push(s);
          await send("startup", { startup: s, isNew: true });
        }
        persist();
        await send("task", { label, state: "done", count: hits.length, fresh });
      } catch (e) {
        await send("task", { label, state: "error", error: (e as Error).message });
      }
    }

    // Enrich: website, careers, emails, score. Two at a time to stay polite.
    await send("phase", { phase: "enrich", total: toEnrich.length });
    const queue = [...toEnrich];
    const worker = async () => {
      while (queue.length) {
        const s = queue.shift()!;
        await enrichStartup(s, db.profile);
        enriched++;
        persist();
        await send("startup", { startup: s, isNew: false });
        await send("progress", { done: enriched, total: toEnrich.length, added });
      }
    };
    await Promise.all(Array.from({ length: Math.min(2, queue.length) }, worker));
    await send("done", { added, enriched, total: db.startups.length });
  });
});

// ------------------------------------------------------------------ outreach

app.get("/outreach", (c) => c.json(db.outreach));

app.post("/outreach/draft", async (c) => {
  if (!db.profile) return c.json({ error: "Upload a resume first" }, 400);
  const { startupId, to } = (await c.req.json()) as { startupId: string; to?: string };
  const s = db.startups.find((x) => x.id === startupId);
  if (!s) return c.json({ error: "startup not found" }, 404);
  const address = to ?? s.emails[0]?.address;
  if (!address) return c.json({ error: "No email address for this startup. Add one first." }, 400);
  const o = newOutreach(s, address, composeOutreach(db.profile, s, db.settings.mail));
  db.outreach.unshift(o);
  persist();
  return c.json(o);
});

app.patch("/outreach/:id", async (c) => {
  const o = db.outreach.find((x) => x.id === c.req.param("id"));
  if (!o) return c.json({ error: "not found" }, 404);
  const patch = (await c.req.json()) as Partial<{ to: string; subject: string; body: string; attachResume: boolean }>;
  Object.assign(o, patch, { updatedAt: new Date().toISOString() });
  persist();
  return c.json(o);
});

app.post("/outreach/:id/send", async (c) => {
  const o = db.outreach.find((x) => x.id === c.req.param("id"));
  if (!o) return c.json({ error: "not found" }, 404);
  if (!db.settings.mail) return c.json({ error: "Connect your mailbox in Settings before sending." }, 400);
  if (o.status === "sent" || o.status === "replied") return c.json({ error: "Already sent" }, 400);
  const sent = await sendOutreach(db.settings.mail, o, db.profile);
  const s = db.startups.find((x) => x.id === sent.startupId);
  if (s && sent.status === "sent" && s.status !== "replied") s.status = "contacted";
  persist();
  return c.json(sent, sent.status === "failed" ? 502 : 200);
});

app.delete("/outreach/:id", (c) => {
  db.outreach = db.outreach.filter((x) => x.id !== c.req.param("id"));
  persist();
  return c.body(null, 204);
});

async function pollReplies() {
  if (!db.settings.mail) return { checked: 0, updated: [] as string[] };
  const res = await checkReplies(db.settings.mail, db.outreach);
  for (const id of res.updated) {
    const o = db.outreach.find((x) => x.id === id);
    const s = o && db.startups.find((x) => x.id === o.startupId);
    if (s && o?.status === "replied") s.status = "replied";
  }
  db.settings.lastReplyCheck = new Date().toISOString();
  persist();
  return res;
}

app.post("/outreach/check", async (c) => {
  if (!db.settings.mail) return c.json({ error: "Mail is not configured" }, 400);
  try {
    return c.json(await pollReplies());
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
});

// Background reply polling every 5 minutes while the server runs.
setInterval(() => {
  if (db.settings.mail && db.outreach.some((o) => o.status === "sent")) pollReplies().catch((e) => console.error("reply check failed:", (e as Error).message));
}, 5 * 60_000);

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

app.get("/health", (c) =>
  c.json({ ok: true, leads: db.leads.length, startups: db.startups.length, outreach: db.outreach.length, profile: !!db.profile, mail: !!db.settings.mail }),
);

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => console.log(`jobly api  →  http://localhost:${port}/api`));
