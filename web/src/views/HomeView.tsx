import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { useEffect } from "react";
import { Hero3D } from "../components/Hero3D";
import { Button } from "../components/ui";
import { useStore } from "../store";

function Counter({ value, suffix = "" }: { value: number; suffix?: string }) {
  const mv = useMotionValue(0);
  const rounded = useTransform(mv, (v) => Math.round(v).toLocaleString() + suffix);
  useEffect(() => {
    const c = animate(mv, value, { duration: 1.2, ease: [0.22, 1, 0.36, 1] });
    return () => c.stop();
  }, [value, mv]);
  return <motion.span className="font-mono text-3xl font-medium tabular-nums">{rounded}</motion.span>;
}

const STEPS = [
  { n: "01", title: "Drop your resume", body: "Parsed on your machine. Skills, titles and places are pulled out and weighted by how much you lean on them." },
  { n: "02", title: "Scan jobs and fresh funding", body: "Pick Hyderabad, Bangalore, Remote or anywhere else. Live postings come from LinkedIn and RemoteOK; startups that just raised money come from the news, with their careers page and contact emails." },
  { n: "03", title: "Reach out, then watch the replies", body: "A cold email is drafted from your resume and their round, sent from your own mailbox, and tracked until they answer. Everything lands in one 3D graph you can edit." },
];

export function HomeView() {
  const setView = useStore((s) => s.setView);
  const profile = useStore((s) => s.profile);
  const leads = useStore((s) => s.leads);
  const startups = useStore((s) => s.startups);
  const outreach = useStore((s) => s.outreach);
  const replies = outreach.filter((o) => o.status === "replied").length;
  const avg = leads.length ? Math.round(leads.reduce((a, l) => a + l.match.score, 0) / leads.length) : 0;
  const strong = leads.filter((l) => l.match.score >= 70).length;

  return (
    <div className="relative mx-auto max-w-7xl px-4">
      <section className="relative grid min-h-[calc(100vh-56px)] items-center gap-8 lg:grid-cols-[1.1fr_1fr]">
        <div className="relative z-10 py-20">
          <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-5 font-mono text-xs uppercase tracking-[0.25em] text-accent">
            local · scraped · yours
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="text-5xl font-semibold leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl"
          >
            Your resume,
            <br />
            <span className="text-fg-3">mapped to real jobs.</span>
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="mt-6 max-w-lg text-lg text-fg-2">
            Upload once. Jobly scrapes live postings, scores each one against what you actually know, and draws the whole thing as a graph you can edit.
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.42 }} className="mt-9 flex flex-wrap gap-3">
            <Button variant="primary" size="lg" onClick={() => setView(profile ? "startups" : "resume")}>
              {profile ? "Find funded startups" : "Upload resume"}
              <span aria-hidden>→</span>
            </Button>
            <Button size="lg" onClick={() => setView(profile ? "leads" : "graph")}>
              {profile ? "Scan jobs" : "Open the graph"}
            </Button>
          </motion.div>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }} className="mt-14 grid max-w-lg grid-cols-2 gap-6 border-t border-line pt-6 sm:grid-cols-4">
            <div>
              <Counter value={leads.length} />
              <p className="mt-1 text-xs text-fg-3">jobs found</p>
            </div>
            <div>
              <Counter value={startups.length} />
              <p className="mt-1 text-xs text-fg-3">funded startups</p>
            </div>
            <div>
              <Counter value={replies} />
              <p className="mt-1 text-xs text-fg-3">replies</p>
            </div>
            <div>
              <Counter value={avg} suffix="%" />
              <p className="mt-1 text-xs text-fg-3">avg match</p>
            </div>
          </motion.div>
        </div>

        <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }} className="relative h-[46vh] lg:h-[78vh]">
          <div className="absolute inset-0 rounded-full bg-accent/10 blur-[120px]" />
          <Hero3D className="absolute inset-0" />
          {strong > 0 && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.2 }} className="glass absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full px-4 py-2 text-xs">
              <span className="text-accent font-mono">{strong}</span> leads over 70% match
            </motion.div>
          )}
        </motion.div>
      </section>

      <section className="grid gap-4 pb-24 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <motion.div
            key={s.n}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ delay: i * 0.08, duration: 0.5 }}
            className="glass glass-hover rounded-2xl p-6"
          >
            <p className="font-mono text-xs text-accent">{s.n}</p>
            <h3 className="mt-3 text-lg font-semibold">{s.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-fg-2">{s.body}</p>
          </motion.div>
        ))}
      </section>
    </div>
  );
}
