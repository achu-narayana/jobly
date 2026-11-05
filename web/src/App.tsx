import { AnimatePresence, motion } from "motion/react";
import { lazy, Suspense, useEffect } from "react";
import { Nav } from "./components/Nav";
import { useStore, type View } from "./store";

// The 3D views pull in three.js; load every view only when opened.
const HomeView = lazy(() => import("./views/HomeView").then((m) => ({ default: m.HomeView })));
const ResumeView = lazy(() => import("./views/ResumeView").then((m) => ({ default: m.ResumeView })));
const LeadsView = lazy(() => import("./views/LeadsView").then((m) => ({ default: m.LeadsView })));
const StartupsView = lazy(() => import("./views/StartupsView").then((m) => ({ default: m.StartupsView })));
const OutreachView = lazy(() => import("./views/OutreachView").then((m) => ({ default: m.OutreachView })));
const GraphView = lazy(() => import("./views/GraphView").then((m) => ({ default: m.GraphView })));

const VIEWS: Record<View, React.LazyExoticComponent<() => React.JSX.Element>> = {
  home: HomeView,
  resume: ResumeView,
  leads: LeadsView,
  startups: StartupsView,
  outreach: OutreachView,
  graph: GraphView,
};

export default function App() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const loadProfile = useStore((s) => s.loadProfile);
  const loadSettings = useStore((s) => s.loadSettings);
  const loadLeads = useStore((s) => s.loadLeads);
  const loadStartups = useStore((s) => s.loadStartups);
  const loadOutreach = useStore((s) => s.loadOutreach);
  const loadGraph = useStore((s) => s.loadGraph);

  useEffect(() => {
    void Promise.all([loadProfile(), loadSettings(), loadLeads(), loadStartups(), loadOutreach(), loadGraph()]).catch(() => {});
    // Keep outreach fresh: the server polls the mailbox every 5 min.
    const t = setInterval(() => void loadOutreach().catch(() => {}), 60_000);
    return () => clearInterval(t);
  }, [loadProfile, loadSettings, loadLeads, loadStartups, loadOutreach, loadGraph]);

  // 1–6 switch views when not typing.
  useEffect(() => {
    const keys: Record<string, View> = { "1": "home", "2": "resume", "3": "leads", "4": "startups", "5": "outreach", "6": "graph" };
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (keys[e.key]) setView(keys[e.key]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setView]);

  const Current = VIEWS[view];
  return (
    <div className="relative min-h-full bg-bg">
      <div className="bg-grid pointer-events-none fixed inset-0" />
      <Nav />
      <AnimatePresence mode="wait">
        <motion.main
          key={view}
          // No filter here: a CSS filter on <main> would become the containing block for the
          // position:fixed side panels and clip them to the page height.
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          className="relative"
        >
          <Suspense fallback={<div className="mx-auto max-w-7xl px-4 py-24 text-center font-mono text-xs text-fg-3 animate-pulse-soft">loading…</div>}>
            <Current />
          </Suspense>
        </motion.main>
      </AnimatePresence>
    </div>
  );
}
