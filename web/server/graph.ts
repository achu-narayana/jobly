import type { DB, GraphData, GraphLink, GraphNode } from "./types.js";

const YOU = "you";
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

/**
 * Build the knowledge graph from the profile and leads, then apply user edits
 * (removed / renamed / pinned / custom). Everything is derived, so the auto part
 * refreshes on every scan while edits survive.
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

  const p = db.profile;
  add({ id: YOU, kind: "you", label: p?.name ?? "You", weight: 1, meta: { headline: p?.headline } });

  for (const s of p?.skills ?? []) {
    const sid = `skill:${s.id}`;
    add({ id: sid, kind: "skill", label: s.label, weight: s.weight / 10, meta: { category: s.category } });
    link(YOU, sid, "has", s.weight / 10);
  }
  for (const loc of p?.locations ?? []) {
    const lid = `loc:${slug(loc)}`;
    add({ id: lid, kind: "location", label: loc, weight: 0.5 });
    link(YOU, lid, "prefers", 0.5);
  }

  const leads = [...db.leads].sort((a, b) => b.match.score - a.match.score).slice(0, 160);
  for (const lead of leads) {
    const jid = `job:${lead.id}`;
    const cid = `co:${slug(lead.company)}`;
    const lid = `loc:${slug(lead.location.split(/[,·]/)[0] || lead.location)}`;
    const sid = `src:${lead.source}`;
    add({
      id: jid,
      kind: "job",
      label: lead.title,
      weight: Math.max(0.15, lead.match.score / 100),
      meta: { leadId: lead.id, company: lead.company, score: lead.match.score, status: lead.status, url: lead.url },
    });
    add({ id: cid, kind: "company", label: lead.company, weight: 0.35 });
    add({ id: lid, kind: "location", label: lead.location.split(/[,·]/)[0].trim() || lead.location, weight: 0.3 });
    add({ id: sid, kind: "source", label: lead.source, weight: 0.4 });
    link(cid, jid, "posts", 0.6);
    link(jid, lid, "in", 0.3);
    link(sid, jid, "found", 0.2);
    for (const s of lead.match.matched.slice(0, 8)) link(jid, `skill:${s.id}`, "needs", 0.5);
    for (const s of lead.match.missing.slice(0, 4)) {
      const skid = `skill:${s.id}`;
      add({ id: skid, kind: "skill", label: s.label, weight: 0.12, meta: { category: s.category, gap: true } });
      link(jid, skid, "wants", 0.25);
    }
    if (lead.status !== "new") link(YOU, jid, lead.status, 0.8);
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
