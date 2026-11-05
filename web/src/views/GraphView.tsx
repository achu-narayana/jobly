import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph3D, { type ForceGraphMethods, type LinkObject, type NodeObject } from "react-force-graph-3d";
import * as THREE from "three";
import { Button, Chip, cx, Empty } from "../components/ui";
import { api } from "../lib/api";
import { STATUSES, type GraphLink, type GraphNode, type LeadStatus, type NodeKind } from "../lib/types";
import { useStore } from "../store";

type N = NodeObject<GraphNode>;
type L = LinkObject<GraphNode, GraphLink>;

const KIND_COLOR: Record<NodeKind, string> = {
  you: "#ffffff",
  skill: "#e6e6e6",
  job: "#b3b3b3",
  startup: "#f5f5f5",
  company: "#8a8a8a",
  location: "#666666",
  source: "#4a4a4a",
  custom: "#ffffff",
};
const KIND_LABEL: Record<NodeKind, string> = { you: "You", skill: "Skill", job: "Job", startup: "Startup", company: "Company", location: "Place", source: "Source", custom: "Custom" };
const KINDS = Object.keys(KIND_COLOR) as NodeKind[];

/** The force engine swaps link endpoints from ids to node objects once it runs. */
const endId = (end: unknown): string => (typeof end === "object" && end !== null ? String((end as { id: string }).id) : String(end));

/** Text sprite drawn on a canvas: no extra dependency, crisp at any zoom. */
const spriteCache = new Map<string, THREE.Sprite>();
function labelSprite(text: string, color: string, scale: number): THREE.Sprite {
  const key = `${text}|${color}|${scale.toFixed(2)}`;
  const hit = spriteCache.get(key);
  if (hit) return hit.clone();
  const font = 44;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  ctx.font = `600 ${font}px Instrument Sans, system-ui, sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width) + 40;
  canvas.width = w;
  canvas.height = font + 28;
  ctx.font = `600 ${font}px Instrument Sans, system-ui, sans-serif`;
  ctx.fillStyle = "rgba(7,8,12,0.72)";
  ctx.beginPath();
  ctx.roundRect(0, 0, w, canvas.height, 18);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.fillText(text, 20, canvas.height / 2 + 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set((w / canvas.height) * scale, scale, 1);
  spriteCache.set(key, sprite);
  return sprite.clone();
}

export function GraphView() {
  const graph = useStore((s) => s.graph);
  const setGraph = useStore((s) => s.setGraph);
  const loadGraph = useStore((s) => s.loadGraph);
  const setView = useStore((s) => s.setView);
  const selectLead = useStore((s) => s.selectLead);
  const selectStartup = useStore((s) => s.selectStartup);
  const setLeadStatus = useStore((s) => s.setLeadStatus);

  const fg = useRef<ForceGraphMethods<N, L> | undefined>(undefined);
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [selected, setSelected] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<NodeKind>>(new Set(["source"]));
  const [query, setQuery] = useState("");
  const [labels, setLabels] = useState<"smart" | "all" | "none">("smart");
  const positions = useRef(new Map<string, { x: number; y: number; z: number }>());

  useEffect(() => {
    if (!graph) void loadGraph();
  }, [graph, loadGraph]);

  useEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);

  // Clone API data into mutable objects the force engine can own, keeping prior positions.
  const data = useMemo(() => {
    if (!graph) return { nodes: [] as N[], links: [] as L[] };
    const keep = new Set(graph.nodes.filter((n) => !hidden.has(n.kind)).map((n) => n.id));
    const nodes: N[] = graph.nodes
      .filter((n) => keep.has(n.id))
      .map((n) => ({ ...n, ...(positions.current.get(n.id) ?? {}) }));
    const links: L[] = graph.links.filter((l) => keep.has(l.source) && keep.has(l.target)).map((l) => ({ ...l }));
    return { nodes, links };
  }, [graph, hidden]);

  const rememberPositions = useCallback(() => {
    for (const n of data.nodes) if (n.x != null) positions.current.set(n.id, { x: n.x, y: n.y!, z: n.z! });
  }, [data]);

  useEffect(() => {
    const g = fg.current;
    if (!g) return;
    g.d3Force("charge")?.strength(-120);
    g.d3Force("link")?.distance((l: L) => 24 + (1 - (l.weight ?? 0.5)) * 50);
  }, [data]);

  // Fit the camera the first time the layout settles.
  const fitted = useRef(false);
  const onEngineStop = useCallback(() => {
    if (fitted.current) return;
    fitted.current = true;
    fg.current?.zoomToFit(900, 60);
  }, []);

  const edit = useCallback(
    async (op: Parameters<typeof api.editGraph>[0]) => {
      rememberPositions();
      setGraph(await api.editGraph(op));
    },
    [rememberPositions, setGraph],
  );

  const flyTo = useCallback((n: N) => {
    if (!fg.current || n.x == null) return;
    const dist = 190;
    const r = Math.hypot(n.x, n.y!, n.z!) || 1;
    fg.current.cameraPosition({ x: (n.x * (r + dist)) / r, y: (n.y! * (r + dist)) / r, z: (n.z! * (r + dist)) / r }, { x: n.x, y: n.y!, z: n.z! }, 900);
  }, []);

  const selectedNode = data.nodes.find((n) => n.id === selected) ?? null;
  const neighbours = useMemo(() => {
    if (!selectedNode) return new Set<string>();
    const s = new Set<string>([selectedNode.id]);
    for (const l of data.links) {
      const a = endId(l.source);
      const b = endId(l.target);
      if (a === selectedNode.id) s.add(b);
      if (b === selectedNode.id) s.add(a);
    }
    return s;
  }, [selectedNode, data.links]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? data.nodes.filter((n) => n.label.toLowerCase().includes(q)).slice(0, 8) : [];
  }, [query, data.nodes]);

  const nodeObject = useCallback(
    (n: N) => {
      const color = KIND_COLOR[n.kind];
      const group = new THREE.Group();
      const r = 2 + n.weight * 6;
      const isSel = selected === n.id;
      const dim = selected && !neighbours.has(n.id);
      const mat = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: isSel ? 1.2 : 0.45,
        transparent: true,
        opacity: dim ? 0.18 : 0.95,
        roughness: 0.35,
      });
      group.add(new THREE.Mesh(new THREE.SphereGeometry(r, 18, 18), mat));
      if (n.kind === "you" || isSel || n.meta?.outreach === "replied") {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(r + 2.2, 0.35, 8, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6 }));
        ring.rotation.x = Math.PI / 2;
        group.add(ring);
      }
      const show = labels === "all" || (labels === "smart" && (n.kind === "you" || n.kind === "company" || n.kind === "startup" || n.weight >= 0.55 || isSel || (selected ? neighbours.has(n.id) : false)));
      if (show && !dim) {
        const s = labelSprite(n.label.length > 28 ? n.label.slice(0, 27) + "…" : n.label, color, 8 + n.weight * 4);
        s.position.y = r + 7;
        group.add(s);
      }
      return group;
    },
    [selected, neighbours, labels],
  );

  if (!graph || graph.nodes.length <= 1) {
    return (
      <div className="mx-auto max-w-7xl px-4">
        <Empty title="The graph is empty" body="Upload a resume and run a scan. Skills, jobs, companies and cities will appear here, linked by what needs what." action={<Button onClick={() => setView("resume")}>Start</Button>} />
      </div>
    );
  }

  return (
    <div className="relative h-[calc(100vh-56px)] w-full overflow-hidden">
      <div ref={box} className="absolute inset-0">
        <ForceGraph3D<GraphNode, GraphLink>
          ref={fg}
          width={size.w}
          height={size.h}
          graphData={data}
          backgroundColor="rgba(0,0,0,0)"
          showNavInfo={false}
          nodeThreeObject={nodeObject}
          nodeLabel={(n) => `${KIND_LABEL[n.kind]} · ${n.label}`}
          linkColor={(l) => {
            const on = !selected || (neighbours.has(endId(l.source)) && neighbours.has(endId(l.target)));
            return on ? (l.kind === "wants" ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.28)") : "rgba(255,255,255,0.04)";
          }}
          linkWidth={(l) => 0.4 + (l.weight ?? 0.3) * 1.2}
          linkOpacity={0.9}
          linkDirectionalParticles={(l) => (l.kind === "needs" || l.kind === "has" ? 1 : 0)}
          linkDirectionalParticleSpeed={0.006}
          linkDirectionalParticleWidth={1.2}
          linkDirectionalParticleColor={() => "#ffffff"}
          onNodeClick={(n) => {
            setSelected(n.id);
            flyTo(n);
          }}
          onNodeDragEnd={(n) => {
            rememberPositions();
            void api.editGraph({ op: "pin", id: n.id, fx: n.x!, fy: n.y!, fz: n.z! }).then(setGraph);
          }}
          onBackgroundClick={() => setSelected(null)}
          enableNodeDrag
          onEngineStop={onEngineStop}
          warmupTicks={80}
          cooldownTime={5000}
        />
      </div>

      {/* Toolbar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="pointer-events-auto glass flex flex-wrap items-center gap-1.5 rounded-2xl p-2">
          {KINDS.map((k) => {
            const count = graph.nodes.filter((n) => n.kind === k).length;
            if (!count) return null;
            const on = !hidden.has(k);
            return (
              <button
                key={k}
                onClick={() => setHidden((h) => { const n = new Set(h); if (n.has(k)) n.delete(k); else n.add(k); return n; })}
                className={cx("flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs transition-colors", on ? "text-fg" : "text-fg-3 line-through")}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: KIND_COLOR[k], opacity: on ? 1 : 0.3 }} />
                {KIND_LABEL[k]} <span className="font-mono text-[10px] text-fg-3">{count}</span>
              </button>
            );
          })}
          <span className="mx-1 h-5 w-px bg-line-2" />
          <select value={labels} onChange={(e) => setLabels(e.target.value as typeof labels)} className="h-7 rounded-lg border border-line-2 bg-bg-2 px-1.5 text-xs">
            <option value="smart">smart labels</option>
            <option value="all">all labels</option>
            <option value="none">no labels</option>
          </select>
        </div>

        <div className="pointer-events-auto relative">
          <div className="glass flex items-center gap-2 rounded-2xl p-2">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="find a node…" className="h-8 w-48 rounded-lg bg-transparent px-2 text-sm outline-none placeholder:text-fg-3" />
            <AddNode onAdd={(label, kind) => void edit({ op: "addNode", node: { id: `custom:${Date.now().toString(36)}`, kind, label, weight: 0.5 } })} />
            <Button size="sm" variant="ghost" onClick={() => fg.current?.zoomToFit(800, 40)}>
              fit
            </Button>
            <Button size="sm" variant="ghost" title="Undo all edits (hidden, renamed, pinned, custom)" onClick={() => confirm("Undo every graph edit?") && void edit({ op: "reset" })}>
              reset
            </Button>
          </div>
          <AnimatePresence>
            {matches.length > 0 && (
              <motion.ul initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="glass absolute right-0 mt-2 w-72 overflow-hidden rounded-xl p-1">
                {matches.map((n) => (
                  <li key={n.id}>
                    <button onClick={() => { setSelected(n.id); flyTo(n); setQuery(""); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-bg-3">
                      <span className="h-2 w-2 rounded-full" style={{ background: KIND_COLOR[n.kind] }} />
                      <span className="truncate">{n.label}</span>
                      <span className="ml-auto text-[10px] text-fg-3">{KIND_LABEL[n.kind]}</span>
                    </button>
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Inspector */}
      <AnimatePresence>
        {selectedNode && (
          <motion.aside
            key={selectedNode.id}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
            className="glass absolute bottom-4 right-4 top-20 flex w-80 flex-col overflow-hidden rounded-2xl"
          >
            <Inspector
              node={selectedNode}
              links={data.links}
              allNodes={data.nodes}
              pinned={!!graph.nodes.find((n) => n.id === selectedNode.id)?.fx || selectedNode.fx != null}
              onClose={() => setSelected(null)}
              onJump={(id) => { const n = data.nodes.find((x) => x.id === id); if (n) { setSelected(id); flyTo(n); } }}
              onRename={(label) => void edit({ op: "rename", id: selectedNode.id, label })}
              onHide={() => { setSelected(null); void edit({ op: "removeNode", id: selectedNode.id }); }}
              onUnpin={() => void edit({ op: "unpin", id: selectedNode.id })}
              onUnlink={(other) => void edit({ op: "removeLink", source: selectedNode.id, target: other }).then(() => edit({ op: "removeLink", source: other, target: selectedNode.id }))}
              onLink={(other) => void edit({ op: "addLink", link: { source: selectedNode.id, target: other, kind: "custom", weight: 0.5 } })}
              onOpenLead={(leadId) => { selectLead(leadId); setView("leads"); }}
              onOpenStartup={(id) => { selectStartup(id); setView("startups"); }}
              onStatus={(leadId, status) => void setLeadStatus(leadId, status).then(loadGraph)}
            />
          </motion.aside>
        )}
      </AnimatePresence>

      <p className="pointer-events-none absolute bottom-4 left-4 font-mono text-[11px] text-fg-3">drag to orbit · scroll to zoom · drag a node to pin it · click to inspect</p>
    </div>
  );
}

function AddNode({ onAdd }: { onAdd: (label: string, kind: NodeKind) => void }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<NodeKind>("custom");
  return (
    <div className="relative">
      <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>
        + node
      </Button>
      <AnimatePresence>
        {open && (
          <motion.form
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            onSubmit={(e) => { e.preventDefault(); if (label.trim()) { onAdd(label.trim(), kind); setLabel(""); setOpen(false); } }}
            className="glass absolute right-0 mt-2 flex w-64 flex-col gap-2 rounded-xl p-3"
          >
            <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} placeholder="label" className="h-8 rounded-lg border border-line-2 bg-bg px-2 text-sm outline-none focus:border-accent" />
            <div className="flex flex-wrap gap-1">
              {(["custom", "skill", "company", "startup", "location", "job"] as NodeKind[]).map((k) => (
                <Chip key={k} active={kind === k} onClick={() => setKind(k)}>
                  {KIND_LABEL[k]}
                </Chip>
              ))}
            </div>
            <Button size="sm" variant="primary" type="submit">
              add
            </Button>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}

function Inspector(props: {
  node: N;
  links: L[];
  allNodes: N[];
  pinned: boolean;
  onClose: () => void;
  onJump: (id: string) => void;
  onRename: (label: string) => void;
  onHide: () => void;
  onUnpin: () => void;
  onUnlink: (otherId: string) => void;
  onLink: (otherId: string) => void;
  onOpenLead: (leadId: string) => void;
  onOpenStartup: (startupId: string) => void;
  onStatus: (leadId: string, s: LeadStatus) => void;
}) {
  const { node } = props;
  const [label, setLabel] = useState(node.label);
  const [linkQ, setLinkQ] = useState("");
  useEffect(() => setLabel(node.label), [node.id, node.label]);

  const connections = props.links
    .map((l) => {
      const a = props.allNodes.find((n) => n.id === endId(l.source));
      const b = props.allNodes.find((n) => n.id === endId(l.target));
      if (!a || !b) return null;
      if (a.id === node.id) return { other: b, kind: l.kind };
      if (b.id === node.id) return { other: a, kind: l.kind };
      return null;
    })
    .filter((x): x is { other: N; kind: string } => !!x)
    .sort((x, y) => (y.other.weight ?? 0) - (x.other.weight ?? 0));

  const linkCandidates = linkQ.trim()
    ? props.allNodes.filter((n) => n.id !== node.id && n.label.toLowerCase().includes(linkQ.toLowerCase()) && !connections.some((c) => c.other.id === n.id)).slice(0, 5)
    : [];

  const meta = (node.meta ?? {}) as { leadId?: string; startupId?: string; outreach?: string | null; round?: string | null; amount?: string | null; hiring?: boolean; score?: number; status?: LeadStatus; url?: string; company?: string; category?: string; gap?: boolean; headline?: string };

  return (
    <>
      <div className="flex items-center gap-2 border-b border-line p-3">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: KIND_COLOR[node.kind] }} />
        <span className="text-xs text-fg-3">{KIND_LABEL[node.kind]}</span>
        {meta.score != null && <span className="font-mono text-xs text-accent">{meta.score}%</span>}
        {meta.gap && <span className="text-[10px] text-amber">gap</span>}
        <button onClick={props.onClose} className="ml-auto text-fg-3 hover:text-fg" aria-label="close">
          ✕
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => label.trim() && label !== node.label && props.onRename(label.trim())}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="w-full rounded-lg border border-transparent bg-transparent px-1 text-lg font-semibold outline-none hover:border-line-2 focus:border-accent"
        />
        {meta.headline && <p className="px-1 text-xs text-fg-3">{meta.headline}</p>}
        {meta.company && <p className="px-1 text-sm text-fg-2">{meta.company}</p>}
        {meta.category && <p className="px-1 text-xs text-fg-3">{meta.category}</p>}
        {meta.startupId && (
          <div className="mt-2 space-y-2 px-1 text-xs text-fg-2">
            <p>{[meta.round, meta.amount].filter(Boolean).join(" · ") || "funded"}{meta.hiring ? " · hiring" : ""}{meta.outreach ? ` · email ${meta.outreach}` : ""}</p>
            <Button size="sm" variant="primary" className="w-full" onClick={() => props.onOpenStartup(meta.startupId!)}>
              open startup
            </Button>
          </div>
        )}

        {meta.leadId && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {STATUSES.map((s) => (
              <Chip key={s.id} active={meta.status === s.id} tone={meta.status === s.id ? "accent" : "neutral"} onClick={() => props.onStatus(meta.leadId!, s.id)}>
                {s.label}
              </Chip>
            ))}
            <Button size="sm" variant="primary" className="mt-1 w-full" onClick={() => props.onOpenLead(meta.leadId!)}>
              open lead
            </Button>
          </div>
        )}

        <p className="mb-2 mt-5 font-mono text-[11px] uppercase tracking-[0.2em] text-fg-3">connections · {connections.length}</p>
        <ul className="space-y-0.5">
          {connections.map((c) => (
            <li key={c.other.id} className="group flex items-center gap-2 rounded-lg px-1.5 py-1 text-sm hover:bg-bg-3">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: KIND_COLOR[c.other.kind] }} />
              <button onClick={() => props.onJump(c.other.id)} className="min-w-0 flex-1 truncate text-left">
                {c.other.label}
              </button>
              <span className="text-[10px] text-fg-3">{c.kind}</span>
              <button onClick={() => props.onUnlink(c.other.id)} className="hidden text-fg-3 hover:text-rose group-hover:inline" title="remove link">
                ×
              </button>
            </li>
          ))}
        </ul>

        <p className="mb-2 mt-5 font-mono text-[11px] uppercase tracking-[0.2em] text-fg-3">link to</p>
        <input value={linkQ} onChange={(e) => setLinkQ(e.target.value)} placeholder="type a node name" className="h-8 w-full rounded-lg border border-line-2 bg-bg px-2 text-sm outline-none focus:border-accent" />
        {linkCandidates.length > 0 && (
          <ul className="mt-1 space-y-0.5">
            {linkCandidates.map((n) => (
              <li key={n.id}>
                <button onClick={() => { props.onLink(n.id); setLinkQ(""); }} className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left text-sm hover:bg-bg-3">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: KIND_COLOR[n.kind] }} />
                  <span className="truncate">{n.label}</span>
                  <span className="ml-auto text-[10px] text-fg-3">+ link</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex gap-2 border-t border-line p-3">
        {props.pinned && (
          <Button size="sm" onClick={props.onUnpin}>
            unpin
          </Button>
        )}
        {meta.url && (
          <a href={meta.url} target="_blank" rel="noreferrer">
            <Button size="sm">open ↗</Button>
          </a>
        )}
        {node.kind !== "you" && (
          <Button size="sm" variant="danger" className="ml-auto" onClick={props.onHide}>
            hide node
          </Button>
        )}
      </div>
    </>
  );
}
