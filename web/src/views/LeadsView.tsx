import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { LocationPicker } from "../components/LocationPicker";
import { Button, Chip, cx, Empty, Ring } from "../components/ui";
import { SOURCES, STATUSES, type Lead, type LeadStatus, type Source } from "../lib/types";
import { useStore } from "../store";

const SOURCE_TONE: Record<Source, "sky" | "accent" | "violet"> = { linkedin: "sky", remoteok: "accent", v2ex: "violet" };

export function LeadsView() {
  const profile = useStore((s) => s.profile);
  const settings = useStore((s) => s.settings);
  const leads = useStore((s) => s.leads);
  const scanning = useStore((s) => s.scanning);
  const tasks = useStore((s) => s.scanTasks);
  const progress = useStore((s) => s.scanProgress);
  const scanError = useStore((s) => s.scanError);
  const startScan = useStore((s) => s.startScan);
  const stopScan = useStore((s) => s.stopScan);
  const selected = useStore((s) => s.selectedLead);
  const select = useStore((s) => s.selectLead);
  const setView = useStore((s) => s.setView);
  const clearLeads = useStore((s) => s.clearLeads);

  const [queries, setQueries] = useState<string[]>([]);
  const locations = settings?.locations ?? [];
  const [sources, setSources] = useState<Source[]>(["linkedin", "remoteok"]);
  const [limit, setLimit] = useState(10);
  const [qDraft, setQDraft] = useState("");

  // Seed the search titles from the profile the first time it arrives.
  useEffect(() => {
    if (profile && !queries.length) setQueries(profile.titles.slice(0, 3));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const [status, setStatus] = useState<LeadStatus | "all">("all");
  const [minScore, setMinScore] = useState(0);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"score" | "recent">("score");

  const visible = useMemo(() => {
    const q = search.toLowerCase();
    return leads
      .filter((l) => (status === "all" ? l.status !== "rejected" : l.status === status))
      .filter((l) => l.match.score >= minScore)
      .filter((l) => !q || `${l.title} ${l.company} ${l.location}`.toLowerCase().includes(q))
      .sort((a, b) => (sort === "score" ? b.match.score - a.match.score : b.fetchedAt.localeCompare(a.fetchedAt)));
  }, [leads, status, minScore, search, sort]);

  const run = () => {
    if (!queries.length) return;
    startScan({ queries, locations, sources, limit });
  };

  const taskList = Object.values(tasks);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Scan controls */}
      <div className="glass rounded-3xl p-5">
        <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr_auto]">
          <ChipInput label="Search titles" items={queries} draft={qDraft} setDraft={setQDraft} onChange={setQueries} placeholder={profile ? "add a title" : "upload a resume to prefill"} />
          <div>
            <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-fg-3">Where (none = anywhere)</p>
            <LocationPicker />
          </div>
          <div className="flex flex-col justify-between gap-3">
            <div>
              <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-fg-3">Sources</p>
              <div className="flex flex-wrap gap-2">
                {SOURCES.map((s) => (
                  <Chip
                    key={s.id}
                    title={s.hint}
                    tone={sources.includes(s.id) ? SOURCE_TONE[s.id] : "neutral"}
                    active={sources.includes(s.id)}
                    onClick={() => setSources((cur) => (cur.includes(s.id) ? cur.filter((x) => x !== s.id) : [...cur, s.id]))}
                  >
                    {s.label}
                  </Chip>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="h-10 rounded-xl border border-line-2 bg-bg-2 px-2 text-sm">
                {[5, 10, 15, 25].map((n) => (
                  <option key={n} value={n}>
                    {n} / search
                  </option>
                ))}
              </select>
              {scanning ? (
                <Button variant="danger" onClick={stopScan}>
                  Stop
                </Button>
              ) : (
                <Button variant="primary" onClick={run} disabled={!queries.length || !sources.length}>
                  Scan live →
                </Button>
              )}
            </div>
          </div>
        </div>

        <AnimatePresence>
          {(scanning || taskList.length > 0) && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="mt-5 border-t border-line pt-4">
                <div className="flex items-center justify-between text-xs text-fg-3">
                  <span>
                    {progress.done}/{progress.total} searches · <span className="text-accent">{progress.added} new</span>
                  </span>
                  {!scanning && <span>done</span>}
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-line">
                  <motion.div className="h-full bg-accent" animate={{ width: progress.total ? `${(progress.done / progress.total) * 100}%` : "0%" }} transition={{ ease: "easeOut" }} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {taskList.map((t) => (
                    <span key={t.label} className={cx("rounded-full border px-2.5 py-1 font-mono text-[11px]", t.state === "running" ? "border-accent/40 text-accent animate-pulse-soft" : t.state === "error" ? "border-rose/40 text-rose" : "border-line-2 text-fg-3")} title={t.error}>
                      {t.label}
                      {t.state === "done" && ` · ${t.count}`}
                      {t.state === "error" && " · failed"}
                    </span>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {scanError && <p className="mt-3 text-xs text-rose">{scanError}</p>}
      </div>

      {/* Filters */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="filter…" className="h-9 w-44 rounded-xl border border-line-2 bg-bg-2 px-3 text-sm outline-none focus:border-accent" />
        {(["all", ...STATUSES.map((s) => s.id)] as const).map((s) => (
          <Chip key={s} active={status === s} onClick={() => setStatus(s)}>
            {s === "all" ? "Active" : STATUSES.find((x) => x.id === s)!.label}
            <span className="ml-1 font-mono text-[10px] text-fg-3">{s === "all" ? leads.filter((l) => l.status !== "rejected").length : leads.filter((l) => l.status === s).length}</span>
          </Chip>
        ))}
        <label className="ml-auto flex items-center gap-2 text-xs text-fg-3">
          min <input type="range" min={0} max={90} step={5} value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} className="accent-accent" /> <span className="w-7 font-mono">{minScore}</span>
        </label>
        <select value={sort} onChange={(e) => setSort(e.target.value as "score" | "recent")} className="h-9 rounded-xl border border-line-2 bg-bg-2 px-2 text-xs">
          <option value="score">best match</option>
          <option value="recent">most recent</option>
        </select>
        {leads.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => confirm("Delete all leads?") && void clearLeads()}>
            clear
          </Button>
        )}
      </div>

      {/* Grid */}
      {visible.length === 0 ? (
        <Empty
          title={leads.length ? "Nothing matches these filters" : "No leads yet"}
          body={leads.length ? "Loosen the score slider or status filter." : profile ? "Hit Scan live. Each search takes 10–40 seconds because it scrapes real pages." : "Upload a resume first so the scan knows what to look for."}
          action={!profile ? <Button onClick={() => setView("resume")}>Upload resume</Button> : undefined}
        />
      ) : (
        <motion.div layout className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence>
            {visible.map((l) => (
              <LeadCard key={l.id} lead={l} onOpen={() => select(l.id)} />
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      <AnimatePresence>{selected && <LeadDetail id={selected} onClose={() => select(null)} />}</AnimatePresence>
    </div>
  );
}

function ChipInput({ label, items, draft, setDraft, onChange, placeholder }: { label: string; items: string[]; draft: string; setDraft: (s: string) => void; onChange: (v: string[]) => void; placeholder: string }) {
  const add = () => {
    const v = draft.trim();
    if (v && !items.includes(v)) onChange([...items, v]);
    setDraft("");
  };
  return (
    <div>
      <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-fg-3">{label}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((t) => (
          <Chip key={t} tone="accent" onRemove={() => onChange(items.filter((x) => x !== t))}>
            {t}
          </Chip>
        ))}
        <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} onBlur={add} placeholder={placeholder} className="h-7 min-w-[150px] rounded-full border border-dashed border-line-2 bg-transparent px-3 text-xs outline-none placeholder:text-fg-3 focus:border-accent" />
      </div>
    </div>
  );
}

function LeadCard({ lead, onOpen }: { lead: Lead; onOpen: () => void }) {
  const setStatus = useStore((s) => s.setLeadStatus);
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.3 }}
      onClick={onOpen}
      className="glass glass-hover cursor-pointer rounded-2xl p-4"
    >
      <div className="flex gap-3">
        <Ring value={lead.match.score} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold leading-tight">{lead.title}</h3>
          <p className="truncate text-sm text-fg-2">{lead.company}</p>
          <p className="truncate text-xs text-fg-3">
            {lead.location}
            {lead.postedAgo && ` · ${lead.postedAgo}`}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Chip tone={SOURCE_TONE[lead.source]}>{SOURCES.find((s) => s.id === lead.source)?.label}</Chip>
        {lead.match.matched.slice(0, 3).map((s) => (
          <Chip key={s.id} tone="neutral">
            {s.label}
          </Chip>
        ))}
        {lead.match.missing.slice(0, 2).map((s) => (
          <Chip key={s.id} tone="amber" title="in the JD, not on your resume">
            + {s.label}
          </Chip>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <select value={lead.status} onClick={(e) => e.stopPropagation()} onChange={(e) => void setStatus(lead.id, e.target.value as LeadStatus)} className="h-7 rounded-lg border border-line bg-transparent px-1.5 text-xs text-fg-2">
          {STATUSES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        {lead.applicants != null && <span className="font-mono text-[11px] text-fg-3">{lead.applicants} applicants</span>}
      </div>
    </motion.article>
  );
}

function LeadDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const lead = useStore((s) => s.leads.find((l) => l.id === id));
  const setStatus = useStore((s) => s.setLeadStatus);
  const setNotes = useStore((s) => s.setLeadNotes);
  const remove = useStore((s) => s.removeLead);
  const [notes, setNotesLocal] = useState(lead?.notes ?? "");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!lead) return null;
  const m = lead.match;
  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-40 bg-bg/60 backdrop-blur-sm" />
      <motion.aside
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", stiffness: 380, damping: 38 }}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-line bg-bg-2"
      >
        <div className="flex items-start gap-4 border-b border-line p-5">
          <Ring value={m.score} size={72} stroke={6} label="match" />
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold leading-tight">{lead.title}</h2>
            <p className="text-fg-2">{lead.company}</p>
            <p className="text-xs text-fg-3">
              {lead.location}
              {lead.postedAgo && ` · ${lead.postedAgo}`}
              {lead.applicants != null && ` · ${lead.applicants} applicants`}
            </p>
            <div className="mt-2 flex gap-3 font-mono text-[11px] text-fg-3">
              <span>skills {Math.round(m.skillScore * 100)}</span>
              <span>title {Math.round(m.titleScore * 100)}</span>
              <span>place {Math.round(m.locationScore * 100)}</span>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg px-2 text-fg-3 hover:text-fg" aria-label="close">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <Chip key={s.id} active={lead.status === s.id} tone={lead.status === s.id ? "accent" : "neutral"} onClick={() => void setStatus(lead.id, s.id)}>
                {s.label}
              </Chip>
            ))}
            <a href={lead.url} target="_blank" rel="noreferrer" className="ml-auto">
              <Button variant="primary" size="sm">
                Open posting ↗
              </Button>
            </a>
          </div>

          <Section title={`You have · ${m.matched.length}`}>
            <div className="flex flex-wrap gap-1.5">
              {m.matched.map((s) => (
                <Chip key={s.id} tone="accent">
                  {s.label}
                </Chip>
              ))}
              {!m.matched.length && <p className="text-sm text-fg-3">No overlap with your resume skills.</p>}
            </div>
          </Section>
          <Section title={`They also want · ${m.missing.length}`}>
            <div className="flex flex-wrap gap-1.5">
              {m.missing.map((s) => (
                <Chip key={s.id} tone="amber">
                  {s.label}
                </Chip>
              ))}
              {!m.missing.length && <p className="text-sm text-fg-3">Nothing we could detect beyond your skills.</p>}
            </div>
          </Section>
          <Section title="Notes">
            <textarea value={notes} onChange={(e) => setNotesLocal(e.target.value)} onBlur={() => notes !== lead.notes && void setNotes(lead.id, notes)} rows={3} placeholder="who you spoke to, salary, anything" className="w-full rounded-xl border border-line-2 bg-bg px-3 py-2 text-sm outline-none focus:border-accent" />
          </Section>
          <Section title="Posting">
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-fg-2">{lead.text || "No description captured."}</pre>
          </Section>
        </div>

        <div className="flex items-center justify-between border-t border-line p-4 text-xs text-fg-3">
          <span className="font-mono">
            {lead.source} · "{lead.query}"
          </span>
          <Button variant="danger" size="sm" onClick={() => void remove(lead.id).then(onClose)}>
            delete lead
          </Button>
        </div>
      </motion.aside>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-fg-3">{title}</p>
      {children}
    </section>
  );
}
