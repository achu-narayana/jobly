import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { LocationPicker } from "../components/LocationPicker";
import { Button, Chip, cx, Empty, Ring } from "../components/ui";
import { STARTUP_STATUSES, type Startup, type StartupStatus } from "../lib/types";
import { useStore } from "../store";

const ago = (iso: string) => {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d < 1 ? "today" : d === 1 ? "yesterday" : d < 30 ? `${d}d ago` : `${Math.floor(d / 30)}mo ago`;
};

export function StartupsView() {
  const profile = useStore((s) => s.profile);
  const settings = useStore((s) => s.settings);
  const startups = useStore((s) => s.startups);
  const scanning = useStore((s) => s.startupScanning);
  const tasks = useStore((s) => s.startupTasks);
  const phase = useStore((s) => s.startupPhase);
  const progress = useStore((s) => s.startupProgress);
  const error = useStore((s) => s.startupError);
  const start = useStore((s) => s.startStartupScan);
  const stop = useStore((s) => s.stopStartupScan);
  const selected = useStore((s) => s.selectedStartup);
  const select = useStore((s) => s.selectStartup);
  const setView = useStore((s) => s.setView);

  const [days, setDays] = useState(30);
  const [limit, setLimit] = useState(10);
  const [status, setStatus] = useState<StartupStatus | "all">("all");
  const [onlyHiring, setOnlyHiring] = useState(false);
  const [search, setSearch] = useState("");

  const locations = settings?.locations ?? [];
  const visible = useMemo(() => {
    const q = search.toLowerCase();
    return startups
      .filter((s) => (status === "all" ? s.status !== "ignored" : s.status === status))
      .filter((s) => !onlyHiring || s.hiring)
      .filter((s) => !q || `${s.name} ${s.location} ${s.investors ?? ""} ${s.roles.join(" ")}`.toLowerCase().includes(q))
      .sort((a, b) => b.match.score - a.match.score || b.announcedAt.localeCompare(a.announcedAt));
  }, [startups, status, onlyHiring, search]);

  const taskList = Object.values(tasks);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="glass rounded-3xl p-5">
        <div className="grid gap-5 lg:grid-cols-[1fr_auto]">
          <div>
            <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-fg-3">Where · recently funded startups</p>
            <LocationPicker />
          </div>
          <div className="flex flex-col justify-end gap-3">
            <div className="flex items-center gap-2">
              <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-10 rounded-xl border border-line-2 bg-bg-2 px-2 text-sm">
                {[14, 30, 60, 90].map((n) => (
                  <option key={n} value={n}>
                    last {n} days
                  </option>
                ))}
              </select>
              <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="h-10 rounded-xl border border-line-2 bg-bg-2 px-2 text-sm">
                {[5, 10, 15, 25].map((n) => (
                  <option key={n} value={n}>
                    {n} / place
                  </option>
                ))}
              </select>
            </div>
            {scanning ? (
              <Button variant="danger" onClick={stop}>
                Stop
              </Button>
            ) : (
              <Button variant="primary" onClick={() => start({ locations, days, limit })} disabled={!profile}>
                Find funded startups →
              </Button>
            )}
            {!profile && <p className="text-xs text-fg-3">Upload a resume first so matches can be scored.</p>}
          </div>
        </div>

        <AnimatePresence>
          {(scanning || taskList.length > 0) && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="mt-5 border-t border-line pt-4">
                <div className="flex items-center justify-between text-xs text-fg-3">
                  <span>
                    {phase === "news" && "reading funding news…"}
                    {phase === "enrich" && `visiting company sites · ${progress.done}/${progress.total}`}
                    {phase === "done" && `done · ${progress.added} new`}
                  </span>
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-line">
                  <motion.div className="h-full bg-fg" animate={{ width: phase === "news" ? "8%" : progress.total ? `${(progress.done / progress.total) * 100}%` : "100%" }} transition={{ ease: "easeOut" }} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {taskList.map((t) => (
                    <span key={t.label} className={cx("rounded-full border px-2.5 py-1 font-mono text-[11px]", t.state === "running" ? "border-fg/40 text-fg animate-pulse-soft" : t.state === "error" ? "border-rose/40 text-rose" : "border-line-2 text-fg-3")} title={t.error}>
                      {t.label}
                      {t.state === "done" && ` · ${t.count} funded, ${t.fresh} new`}
                      {t.state === "error" && " · failed"}
                    </span>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {error && <p className="mt-3 text-xs text-rose">{error}</p>}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="filter…" className="h-9 w-44 rounded-xl border border-line-2 bg-bg-2 px-3 text-sm outline-none focus:border-accent" />
        {(["all", ...STARTUP_STATUSES.map((s) => s.id)] as const).map((s) => (
          <Chip key={s} active={status === s} onClick={() => setStatus(s)}>
            {s === "all" ? "Active" : STARTUP_STATUSES.find((x) => x.id === s)!.label}
            <span className="ml-1 font-mono text-[10px] text-fg-3">{s === "all" ? startups.filter((x) => x.status !== "ignored").length : startups.filter((x) => x.status === s).length}</span>
          </Chip>
        ))}
        <Chip active={onlyHiring} onClick={() => setOnlyHiring((v) => !v)}>
          hiring now
        </Chip>
      </div>

      {visible.length === 0 ? (
        <Empty
          title={startups.length ? "Nothing matches these filters" : "No funded startups yet"}
          body={startups.length ? "Try another status or turn off the hiring filter." : "Pick places above and run the scan. It reads the last weeks of funding news, then visits each company's site to find roles and contact emails."}
          action={!profile ? <Button onClick={() => setView("resume")}>Upload resume</Button> : undefined}
        />
      ) : (
        <motion.div layout className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence>
            {visible.map((s) => (
              <StartupCard key={s.id} s={s} onOpen={() => select(s.id)} />
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      <AnimatePresence>{selected && <StartupDetail id={selected} onClose={() => select(null)} />}</AnimatePresence>
    </div>
  );
}

function StartupCard({ s, onOpen }: { s: Startup; onOpen: () => void }) {
  const funding = [s.round, s.amount].filter(Boolean).join(" · ");
  return (
    <motion.article layout initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.3 }} onClick={onOpen} className="glass glass-hover cursor-pointer rounded-2xl p-4">
      <div className="flex gap-3">
        <Ring value={s.match.score} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold leading-tight">{s.name}</h3>
          <p className="truncate text-sm text-fg-2">{funding || "Funding announced"}</p>
          <p className="truncate text-xs text-fg-3">
            {s.location} · {ago(s.announcedAt)}
            {s.investors && ` · ${s.investors}`}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {!s.enriched && <Chip tone="neutral">looking up…</Chip>}
        {s.hiring && <Chip tone="accent">hiring</Chip>}
        {s.roles.slice(0, 2).map((r) => (
          <Chip key={r}>{r}</Chip>
        ))}
        {s.emails[0] && (
          <Chip tone={s.emails[0].source === "found" ? "neutral" : "amber"} title={s.emails[0].source === "guessed" ? "guessed from the domain" : "found on their site"}>
            {s.emails[0].address}
          </Chip>
        )}
        {s.enrichError && <Chip tone="amber">{s.enrichError}</Chip>}
      </div>
      <div className="mt-3 flex items-center justify-between text-xs">
        <span className={cx("rounded-md border px-1.5 py-0.5", s.status === "replied" ? "border-fg text-fg" : "border-line text-fg-2")}>{STARTUP_STATUSES.find((x) => x.id === s.status)?.label}</span>
        <span className="font-mono text-fg-3">{s.newsSource}</span>
      </div>
    </motion.article>
  );
}

function StartupDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const s = useStore((st) => st.startups.find((x) => x.id === id));
  const allOutreach = useStore((st) => st.outreach);
  const outreach = useMemo(() => allOutreach.filter((o) => o.startupId === id), [allOutreach, id]);
  const setStatus = useStore((st) => st.setStartupStatus);
  const setNotes = useStore((st) => st.setStartupNotes);
  const setEmails = useStore((st) => st.setStartupEmails);
  const setWebsite = useStore((st) => st.setStartupWebsite);
  const reEnrich = useStore((st) => st.reEnrich);
  const remove = useStore((st) => st.removeStartup);
  const draft = useStore((st) => st.draftOutreach);
  const setView = useStore((st) => st.setView);
  const profile = useStore((st) => st.profile);
  const [notes, setNotesLocal] = useState(s?.notes ?? "");
  const [emailDraft, setEmailDraft] = useState("");
  const [siteDraft, setSiteDraft] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!s) return null;
  const m = s.match;

  const compose = async (to?: string) => {
    setBusy("draft");
    setErr(null);
    try {
      await draft(s.id, to);
      onClose();
      setView("outreach");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-40 bg-bg/60 backdrop-blur-sm" />
      <motion.aside initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", stiffness: 380, damping: 38 }} className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-line bg-bg-2">
        <div className="flex items-start gap-4 border-b border-line p-5">
          <Ring value={m.score} size={72} stroke={6} label="match" />
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold leading-tight">{s.name}</h2>
            <p className="text-fg-2">{[s.round, s.amount, s.investors && `led by ${s.investors}`].filter(Boolean).join(" · ") || "Funding announced"}</p>
            <p className="text-xs text-fg-3">
              {s.location} · {ago(s.announcedAt)} · via {s.newsSource}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg px-2 text-fg-3 hover:text-fg" aria-label="close">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="flex flex-wrap gap-2">
            {STARTUP_STATUSES.map((st) => (
              <Chip key={st.id} active={s.status === st.id} tone={s.status === st.id ? "accent" : "neutral"} onClick={() => void setStatus(s.id, st.id)}>
                {st.label}
              </Chip>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="primary" size="sm" disabled={!profile || !s.emails.length || busy === "draft"} onClick={() => void compose()}>
              {busy === "draft" ? "drafting…" : "Draft cold email →"}
            </Button>
            {s.website && (
              <a href={s.website} target="_blank" rel="noreferrer">
                <Button size="sm">site ↗</Button>
              </a>
            )}
            {s.careersUrl && (
              <a href={s.careersUrl} target="_blank" rel="noreferrer">
                <Button size="sm">careers ↗</Button>
              </a>
            )}
            <a href={s.newsUrl} target="_blank" rel="noreferrer">
              <Button size="sm">news ↗</Button>
            </a>
            <Button size="sm" variant="ghost" disabled={busy === "enrich"} onClick={() => { setBusy("enrich"); void reEnrich(s.id).finally(() => setBusy(null)); }}>
              {busy === "enrich" ? "looking up…" : "re-check site"}
            </Button>
          </div>
          {err && <p className="mt-2 text-xs text-rose">{err}</p>}
          {!profile && <p className="mt-2 text-xs text-fg-3">Upload a resume to draft an email.</p>}

          <Section title={`Contact emails · ${s.emails.length}`}>
            <div className="flex flex-wrap gap-1.5">
              {s.emails.map((e) => (
                <Chip key={e.address} tone={e.source === "found" ? "accent" : "amber"} title={e.source === "guessed" ? "guessed from the domain — may bounce" : "found on their site"} onRemove={() => void setEmails(s.id, s.emails.filter((x) => x.address !== e.address).map((x) => x.address))}>
                  {e.address}
                  {e.source === "guessed" && "?"}
                </Chip>
              ))}
              <input
                value={emailDraft}
                onChange={(e) => setEmailDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && /@/.test(emailDraft)) { void setEmails(s.id, [...s.emails.map((x) => x.address), emailDraft.trim()]); setEmailDraft(""); } }}
                placeholder="add an address"
                className="h-7 min-w-[160px] rounded-full border border-dashed border-line-2 bg-transparent px-3 text-xs outline-none placeholder:text-fg-3 focus:border-accent"
              />
            </div>
            <p className="mt-2 text-xs text-fg-3">Bright = found on their site. Dim with ? = guessed from the domain.</p>
          </Section>

          <Section title={`Open roles · ${s.roles.length}${s.hiring ? " · hiring" : ""}`}>
            <div className="flex flex-wrap gap-1.5">
              {s.roles.map((r) => (
                <Chip key={r}>{r}</Chip>
              ))}
              {!s.roles.length && <p className="text-sm text-fg-3">{s.careersUrl ? "No role titles detected on their careers page." : "No careers page found."}</p>}
            </div>
          </Section>

          <Section title={`You have · ${m.matched.length}`}>
            <div className="flex flex-wrap gap-1.5">
              {m.matched.map((x) => (
                <Chip key={x.id} tone="accent">
                  {x.label}
                </Chip>
              ))}
              {!m.matched.length && <p className="text-sm text-fg-3">No overlap detected yet.</p>}
            </div>
          </Section>
          {m.missing.length > 0 && (
            <Section title={`They mention · ${m.missing.length}`}>
              <div className="flex flex-wrap gap-1.5">
                {m.missing.map((x) => (
                  <Chip key={x.id} tone="amber">
                    {x.label}
                  </Chip>
                ))}
              </div>
            </Section>
          )}

          {outreach.length > 0 && (
            <Section title={`Outreach · ${outreach.length}`}>
              <ul className="space-y-1 text-sm">
                {outreach.map((o) => (
                  <li key={o.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2">
                    <span className="truncate">{o.subject}</span>
                    <span className="ml-2 shrink-0 font-mono text-xs text-fg-3">{o.status}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title="Notes">
            <textarea value={notes} onChange={(e) => setNotesLocal(e.target.value)} onBlur={() => notes !== s.notes && void setNotes(s.id, notes)} rows={3} placeholder="founder names, who introduced you, anything" className="w-full rounded-xl border border-line-2 bg-bg px-3 py-2 text-sm outline-none focus:border-accent" />
          </Section>

          <Section title="About">
            <p className="text-sm leading-relaxed text-fg-2">{s.description || s.newsTitle}</p>
            <p className="mt-2 text-xs text-fg-3">{s.newsTitle}</p>
          </Section>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line p-4 text-xs text-fg-3">
          <form
            className="flex min-w-0 flex-1 items-center gap-2"
            onSubmit={(e) => { e.preventDefault(); if (siteDraft.trim()) { setBusy("enrich"); void setWebsite(s.id, siteDraft.trim()).finally(() => { setBusy(null); setSiteDraft(""); }); } }}
          >
            <input value={siteDraft} onChange={(e) => setSiteDraft(e.target.value)} placeholder={s.website ?? "wrong or missing site? type the real one"} className="h-8 min-w-0 flex-1 rounded-lg border border-line-2 bg-bg px-2 font-mono text-xs outline-none placeholder:text-fg-3 focus:border-accent" />
            {siteDraft && (
              <Button size="sm" type="submit" disabled={busy === "enrich"}>
                use site
              </Button>
            )}
          </form>
          <Button variant="danger" size="sm" onClick={() => void remove(s.id).then(onClose)}>
            delete
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
