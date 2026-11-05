import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { useStore, type View } from "../store";
import { cx, Kbd } from "./ui";

const TABS: { id: View; label: string; key: string }[] = [
  { id: "resume", label: "Resume", key: "2" },
  { id: "leads", label: "Jobs", key: "3" },
  { id: "startups", label: "Startups", key: "4" },
  { id: "outreach", label: "Outreach", key: "5" },
  { id: "graph", label: "Graph", key: "6" },
];

export function Nav() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const leads = useStore((s) => s.leads);
  const startups = useStore((s) => s.startups);
  const outreach = useStore((s) => s.outreach);
  const scanning = useStore((s) => s.scanning || s.startupScanning);
  const profile = useStore((s) => s.profile);
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    const ping = () => fetch("/api/health").then((r) => setOnline(r.ok)).catch(() => setOnline(false));
    ping();
    const t = setInterval(ping, 8000);
    return () => clearInterval(t);
  }, []);

  const counts: Partial<Record<View, number>> = {
    leads: leads.length,
    startups: startups.filter((s) => s.status !== "ignored").length,
    outreach: outreach.filter((o) => o.status === "replied").length,
  };

  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4">
        <button onClick={() => setView("home")} className="mr-3 flex items-center gap-2" aria-label="Jobly home">
          <Logo />
        </button>

        <nav className="relative flex items-center gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setView(t.id)} className={cx("relative shrink-0 rounded-lg px-3 py-1.5 text-sm transition-colors", view === t.id ? "text-fg" : "text-fg-3 hover:text-fg-2")}>
              {view === t.id && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-lg bg-bg-3" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
              <span className="relative flex items-center gap-2">
                {t.label}
                {!!counts[t.id] && <span className="rounded-full bg-fg/10 px-1.5 font-mono text-[10px] text-fg">{counts[t.id]}</span>}
                <span className="hidden lg:inline">
                  <Kbd>{t.key}</Kbd>
                </span>
              </span>
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3 text-xs text-fg-3">
          {scanning && (
            <span className="flex items-center gap-2 text-fg">
              <span className="h-1.5 w-1.5 rounded-full bg-fg animate-pulse-soft" /> scanning
            </span>
          )}
          {profile && <span className="hidden sm:inline truncate max-w-[180px]">{profile.name}</span>}
          <span className="flex items-center gap-1.5" title={online ? "API connected" : "API offline — run npm run dev"}>
            <span className={cx("h-1.5 w-1.5 rounded-full", online ? "bg-fg" : online === false ? "bg-rose" : "bg-fg-3")} />
            {online ? "live" : online === false ? "offline" : "…"}
          </span>
        </div>
      </div>
    </header>
  );
}

function Logo() {
  return (
    <span className="flex items-center gap-2">
      <svg width="22" height="22" viewBox="0 0 64 64" aria-hidden>
        <circle cx="32" cy="32" r="7" fill="currentColor" />
        {[
          [14, 20],
          [50, 18],
          [18, 48],
          [48, 46],
        ].map(([x, y], i) => (
          <g key={i}>
            <line x1="32" y1="32" x2={x} y2={y} stroke="currentColor" strokeWidth="2" opacity=".5" />
            <circle cx={x} cy={y} r="4" fill="currentColor" opacity=".9" />
          </g>
        ))}
      </svg>
      <span className="text-[15px] font-semibold tracking-tight">Jobly</span>
    </span>
  );
}
