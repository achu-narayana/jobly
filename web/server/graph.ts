import type { DB, GraphData, GraphLink, GraphNode } from "./types.js";

const YOU = "you";
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

/**
 * Build the knowledge graph from the profile, job leads, funded startups and
 * outreach, then apply user edits (removed / renamed / pinned / custom).
 * Everything is derived, so the auto part refreshes on every scan while edits survive.
 */
export function buildGraph(db: DB): GraphData {
  const nodes = new Map<string, GraphNode>();
  const links = new Map<string, GraphLink>();
  const add = (n: GraphNode) => {
    const prev = nodes.get(n.id);
    if (!prev || prev.weight < n.weight) nodes.set(n.id, { ...prev, ...n });
  };
  const link = (source: string, target: string, kind: string, weight: number) => {
    const key = `${source}->${target}`;
    const prev = links.get(key);
    links.set(key, { source, target, kind, weight: Math.max(weight, prev?.weight ?? 0) });
  };
  const locNode = (loc: string) => {
    const label = loc.split(/[,·]/)[0].trim() || loc;
    const id = `loc:${slug(label)}`;
    add({ id, kind: "location", label, weight: 0.3 });
    return id;
  };

  const p = db.profile;
  add({ id: YOU, kind: "you", label: p?.name ?? "You", weight: 1, meta: { headline: p?.headline } });

  for (const s of p?.skills ?? []) {
    const sid = `skill:${s.id}`;
    add({ id: sid, kind: "skill", label: s.label, weight: s.weight / 10, meta: { category: s.category } });
    link(YOU, sid, "has", s.weight / 10);
  }
  for (const loc of new Set([...(p?.locations ?? []), ...db.settings.locations])) {
    const lid = locNode(loc);
    add({ id: lid, kind: "location", label: loc, weight: 0.5 });
    link(YOU, lid, "prefers", 0.5);
  }

  const leads = [...db.leads].sort((a, b) => b.match.score - a.match.score).slice(0, 160);
  for (const lead of leads) {
    const jid = `job:${lead.id}`;
    const cid = `co:${slug(lead.company)}`;
    add({
      id: jid,
      kind: "job",
      label: lead.title,
      weight: Math.max(0.15, lead.match.score / 100),
      meta: { leadId: lead.id, company: lead.company, score: lead.match.score, status: lead.status, url: lead.url },
    });
    add({ id: cid, kind: "company", label: lead.company, weight: 0.35 });
    add({ id: `src:${lead.source}`, kind: "source", label: lead.source, weight: 0.4 });
    link(cid, jid, "posts", 0.6);
    link(jid, locNode(lead.location), "in", 0.3);
    link(`src:${lead.source}`, jid, "found", 0.2);
    for (const s of lead.match.matched.slice(0, 8)) link(jid, `skill:${s.id}`, "needs", 0.5);
    for (const s of lead.match.missing.slice(0, 4)) {
      const skid = `skill:${s.id}`;
      add({ id: skid, kind: "skill", label: s.label, weight: 0.12, meta: { category: s.category, gap: true } });
      link(jid, skid, "wants", 0.25);
    }
    if (lead.status !== "new") link(YOU, jid, lead.status, 0.8);
  }

  // Funded startups: bigger when the match is good, linked to the outreach state.
  for (const s of db.startups.filter((x) => x.status !== "ignored").slice(0, 120)) {
    const sid = `startup:${s.id}`;
    const mail = db.outreach.filter((o) => o.startupId === s.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    add({
      id: sid,
      kind: "startup",
      label: s.name,
      weight: Math.max(0.2, s.match.score / 100),
      meta: { startupId: s.id, score: s.match.score, status: s.status, round: s.round, amount: s.amount, url: s.website ?? s.newsUrl, outreach: mail?.status ?? null, hiring: s.hiring },
    });
    link(sid, locNode(s.location), "in", 0.3);
    for (const sk of s.match.matched.slice(0, 6)) link(sid, `skill:${sk.id}`, "needs", 0.45);
    if (mail) link(YOU, sid, mail.status === "replied" ? "replied" : mail.status === "sent" ? "emailed" : mail.status, mail.status === "replied" ? 1 : 0.7);
    else if (s.status !== "new") link(YOU, sid, s.status, 0.6);
  }

  // Overlay: user edits win.
  const o = db.overlay;
  for (const n of o.customNodes) add(n);
  for (const l of o.customLinks) link(l.source, l.target, l.kind, l.weight);
  for (const id of o.removedNodes) nodes.delete(id);
  for (const key of o.removedLinks) links.delete(key);
  for (const [id, label] of Object.entries(o.renamed)) {
    const n = nodes.get(id);
    if (n) n.label = label;
  }
  for (const [id, pos] of Object.entries(o.pinned)) {
    const n = nodes.get(id);
    if (n) Object.assign(n, pos);
  }

  const alive = [...links.values()].filter((l) => nodes.has(l.source) && nodes.has(l.target));
  return { nodes: [...nodes.values()], links: alive };
}
