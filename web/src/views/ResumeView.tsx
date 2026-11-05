import { AnimatePresence, motion } from "motion/react";
import { useRef, useState, type DragEvent } from "react";
import { Button, Chip, cx } from "../components/ui";
import { useStore } from "../store";
import type { SkillHit } from "../lib/types";

const CATEGORY_TONE: Record<string, "accent" | "violet" | "amber" | "sky" | "rose" | "neutral"> = {
  language: "accent",
  frontend: "sky",
  backend: "violet",
  data: "amber",
  ai: "rose",
  cloud: "sky",
  infra: "violet",
  mobile: "accent",
  quality: "amber",
  practice: "neutral",
  tools: "neutral",
  design: "rose",
  domain: "neutral",
};

export function ResumeView() {
  const profile = useStore((s) => s.profile);
  const loading = useStore((s) => s.profileLoading);
  const error = useStore((s) => s.uploadError);
  const upload = useStore((s) => s.uploadResume);
  const update = useStore((s) => s.updateProfile);
  const setView = useStore((s) => s.setView);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files[0];
    if (f) void upload(f);
  };

  const groups = (profile?.skills ?? []).reduce<Record<string, SkillHit[]>>((acc, s) => {
    (acc[s.category] ??= []).push(s);
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        {/* Drop zone */}
        <div>
          <motion.div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
            onClick={() => input.current?.click()}
            animate={{ scale: drag ? 1.02 : 1 }}
            className={cx(
              "glass relative cursor-pointer overflow-hidden rounded-3xl p-8 text-center transition-colors",
              drag ? "border-accent" : "hover:border-line-2",
            )}
          >
            <input ref={input} type="file" accept=".pdf,.docx,.txt,.md" className="hidden" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
            <div className="mx-auto flex h-20 w-20 items-center justify-center">
              <OrbitIcon active={loading || drag} />
            </div>
            <h2 className="mt-5 text-xl font-semibold">{loading ? "Reading…" : profile ? "Replace resume" : "Drop your resume"}</h2>
            <p className="mt-2 text-sm text-fg-2">PDF, DOCX or TXT. Parsed locally — nothing is uploaded anywhere.</p>
            {profile && <p className="mt-4 truncate font-mono text-xs text-fg-3">{profile.fileName}</p>}
            <AnimatePresence>
              {error && (
                <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 rounded-lg bg-rose/10 px-3 py-2 text-xs text-rose">
                  {error}
                </motion.p>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Deferred: AI tailoring. Kept as an explicit slot so it is obvious where it goes. */}
          <div className="mt-4 rounded-2xl border border-dashed border-line p-5 text-sm text-fg-3">
            <p className="font-medium text-fg-2">Resume Studio · later</p>
            <p className="mt-1">Tailoring your resume to a job description or a company's stack is planned for a later phase. No AI runs in Jobly today.</p>
          </div>
        </div>

        {/* Profile */}
        <div className="min-h-[60vh]">
          <AnimatePresence mode="wait">
            {!profile ? (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex h-full flex-col justify-center gap-3 rounded-3xl p-8">
                <p className="font-mono text-xs uppercase tracking-[0.25em] text-accent">what happens next</p>
                <h3 className="text-2xl font-semibold">We read it the way a recruiter skims it.</h3>
                <p className="max-w-md text-fg-2">Titles, cities and every technology you mention get pulled out and weighted by how often they appear. That weighting drives the match score on every lead.</p>
              </motion.div>
            ) : (
              <motion.div key="profile" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">
                <div className="glass rounded-3xl p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h2 className="text-3xl font-semibold tracking-tight">{profile.name}</h2>
                      <p className="mt-1 text-fg-2">{profile.headline}</p>
                      {profile.email && <p className="mt-1 font-mono text-xs text-fg-3">{profile.email}</p>}
                    </div>
                    <Button variant="primary" onClick={() => setView("leads")}>
                      Scan for leads →
                    </Button>
                  </div>

                  <div className="mt-6 grid gap-5 sm:grid-cols-2">
                    <EditableList
                      title="Titles to search"
                      items={profile.titles}
                      placeholder="e.g. Platform Engineer"
                      onChange={(titles) => void update({ titles })}
                    />
                    <EditableList
                      title="Locations"
                      items={profile.locations}
                      placeholder="e.g. Berlin or Remote"
                      onChange={(locations) => void update({ locations })}
                    />
                  </div>
                </div>

                <div className="glass rounded-3xl p-6">
                  <div className="flex items-baseline justify-between">
                    <h3 className="text-lg font-semibold">Skills · {profile.skills.length}</h3>
                    <p className="text-xs text-fg-3">bar = how much your resume leans on it</p>
                  </div>
                  <div className="mt-5 space-y-5">
                    {Object.entries(groups).map(([cat, skills]) => (
                      <div key={cat}>
                        <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-fg-3">{cat}</p>
                        <div className="flex flex-wrap gap-2">
                          {skills.map((s, i) => (
                            <motion.div key={s.id} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.02 }} className="relative">
                              <Chip tone={CATEGORY_TONE[cat] ?? "neutral"} onRemove={() => void update({ skills: profile.skills.filter((x) => x.id !== s.id) })}>
                                {s.label}
                                <span className="ml-1 inline-block h-1 w-8 overflow-hidden rounded-full bg-line-2 align-middle">
                                  <motion.span className="block h-full bg-current" initial={{ width: 0 }} animate={{ width: `${s.weight * 10}%` }} transition={{ delay: 0.2 + i * 0.03 }} />
                                </span>
                              </Chip>
                            </motion.div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function EditableList({ title, items, placeholder, onChange }: { title: string; items: string[]; placeholder: string; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (v && !items.includes(v)) onChange([...items, v]);
    setDraft("");
  };
  return (
    <div>
      <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-fg-3">{title}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((t) => (
          <Chip key={t} onRemove={() => onChange(items.filter((x) => x !== t))}>
            {t}
          </Chip>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          onBlur={add}
          placeholder={placeholder}
          className="h-7 min-w-[140px] rounded-full border border-dashed border-line-2 bg-transparent px-3 text-xs outline-none placeholder:text-fg-3 focus:border-accent"
        />
      </div>
    </div>
  );
}

function OrbitIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 80 80" className={cx("h-20 w-20", active ? "animate-spin-slow" : "")} aria-hidden>
      <circle cx="40" cy="40" r="30" fill="none" stroke="var(--color-line-2)" strokeDasharray="3 5" />
      <circle cx="40" cy="40" r="18" fill="none" stroke="var(--color-line-2)" />
      <circle cx="40" cy="40" r="5" fill="var(--color-accent)" />
      <circle cx="70" cy="40" r="3.5" fill="var(--color-violet)" />
      <circle cx="40" cy="22" r="3" fill="var(--color-accent)" />
      <circle cx="19" cy="55" r="2.5" fill="var(--color-sky)" />
    </svg>
  );
}
