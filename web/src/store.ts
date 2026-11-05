import { create } from "zustand";
import { api, type SettingsResponse, type TaskEvent } from "./lib/api";
import type { GraphData, Lead, LeadStatus, MailSettings, Outreach, Profile, ScanRequest, Startup, StartupStatus } from "./lib/types";

export type View = "home" | "resume" | "leads" | "startups" | "outreach" | "graph";

interface Progress {
  done: number;
  total: number;
  added: number;
}

interface State {
  view: View;
  setView: (v: View) => void;

  profile: Profile | null;
  profileLoading: boolean;
  uploadError: string | null;
  loadProfile: () => Promise<void>;
  uploadResume: (file: File) => Promise<void>;
  updateProfile: (patch: Partial<Profile>) => Promise<void>;

  settings: SettingsResponse | null;
  loadSettings: () => Promise<void>;
  setLocations: (locations: string[]) => Promise<void>;
  saveMail: (mail: MailSettings | null) => Promise<void>;

  leads: Lead[];
  loadLeads: () => Promise<void>;
  setLeadStatus: (id: string, status: LeadStatus) => Promise<void>;
  setLeadNotes: (id: string, notes: string) => Promise<void>;
  removeLead: (id: string) => Promise<void>;
  clearLeads: () => Promise<void>;
  selectedLead: string | null;
  selectLead: (id: string | null) => void;

  scanning: boolean;
  scanTasks: Record<string, TaskEvent>;
  scanProgress: Progress;
  scanError: string | null;
  startScan: (req: ScanRequest) => void;
  stopScan: () => void;

  startups: Startup[];
  loadStartups: () => Promise<void>;
  setStartupStatus: (id: string, status: StartupStatus) => Promise<void>;
  setStartupNotes: (id: string, notes: string) => Promise<void>;
  setStartupEmails: (id: string, emails: string[]) => Promise<void>;
  setStartupWebsite: (id: string, website: string | null) => Promise<void>;
  reEnrich: (id: string) => Promise<void>;
  removeStartup: (id: string) => Promise<void>;
  selectedStartup: string | null;
  selectStartup: (id: string | null) => void;

  startupScanning: boolean;
  startupTasks: Record<string, TaskEvent>;
  startupPhase: string;
  startupProgress: Progress;
  startupError: string | null;
  startStartupScan: (req: { locations: string[]; days: number; limit: number }) => void;
  stopStartupScan: () => void;

  outreach: Outreach[];
  loadOutreach: () => Promise<void>;
  draftOutreach: (startupId: string, to?: string) => Promise<Outreach>;
  updateOutreach: (id: string, patch: Partial<Pick<Outreach, "to" | "subject" | "body" | "attachResume">>) => Promise<void>;
  sendOutreach: (id: string) => Promise<Outreach>;
  checkReplies: () => Promise<{ checked: number; updated: string[] }>;
  removeOutreach: (id: string) => Promise<void>;
  selectedOutreach: string | null;
  selectOutreach: (id: string | null) => void;

  graph: GraphData | null;
  loadGraph: () => Promise<void>;
  setGraph: (g: GraphData) => void;
}

let stopScanFn: (() => void) | null = null;
let stopStartupFn: (() => void) | null = null;

const VIEWS: View[] = ["home", "resume", "leads", "startups", "outreach", "graph"];
const viewFromHash = (): View => {
  const h = window.location.hash.replace("#", "") as View;
  return VIEWS.includes(h) ? h : "home";
};

export const useStore = create<State>((set, get) => ({
  view: viewFromHash(),
  setView: (view) => {
    if (window.location.hash !== `#${view}`) history.pushState(null, "", `#${view}`);
    set({ view });
  },

  profile: null,
  profileLoading: false,
  uploadError: null,
  loadProfile: async () => set({ profile: await api.profile() }),
  uploadResume: async (file) => {
    set({ profileLoading: true, uploadError: null });
    try {
      const profile = await api.uploadResume(file);
      set({ profile, profileLoading: false });
      await Promise.all([get().loadLeads(), get().loadStartups()]);
    } catch (e) {
      set({ profileLoading: false, uploadError: (e as Error).message });
    }
  },
  updateProfile: async (patch) => {
    set({ profile: await api.updateProfile(patch) });
    await Promise.all([get().loadLeads(), get().loadStartups()]);
  },

  settings: null,
  loadSettings: async () => set({ settings: await api.settings() }),
  setLocations: async (locations) => {
    const cur = get().settings;
    if (cur) set({ settings: { ...cur, locations } });
    set({ settings: await api.updateSettings({ locations }) });
  },
  saveMail: async (mail) => set({ settings: await api.updateSettings({ mail }) }),

  leads: [],
  loadLeads: async () => set({ leads: await api.leads() }),
  setLeadStatus: async (id, status) => {
    set({ leads: get().leads.map((l) => (l.id === id ? { ...l, status } : l)) });
    await api.updateLead(id, { status });
  },
  setLeadNotes: async (id, notes) => {
    set({ leads: get().leads.map((l) => (l.id === id ? { ...l, notes } : l)) });
    await api.updateLead(id, { notes });
  },
  removeLead: async (id) => {
    set({ leads: get().leads.filter((l) => l.id !== id), selectedLead: get().selectedLead === id ? null : get().selectedLead });
    await api.deleteLead(id);
  },
  clearLeads: async () => {
    set({ leads: [], selectedLead: null });
    await api.clearLeads();
  },
  selectedLead: null,
  selectLead: (selectedLead) => set({ selectedLead }),

  scanning: false,
  scanTasks: {},
  scanProgress: { done: 0, total: 0, added: 0 },
  scanError: null,
  startScan: (req) => {
    stopScanFn?.();
    set({ scanning: true, scanTasks: {}, scanProgress: { done: 0, total: 0, added: 0 }, scanError: null });
    stopScanFn = api.scan(req, {
      start: ({ total }) => set({ scanProgress: { done: 0, total, added: 0 } }),
      task: (t) => set({ scanTasks: { ...get().scanTasks, [t.label]: t } }),
      lead: ({ lead, isNew }) => {
        const leads = get().leads;
        set({ leads: isNew ? [lead, ...leads] : leads.map((l) => (l.id === lead.id ? lead : l)) });
      },
      progress: (p) => set({ scanProgress: p }),
      done: () => {
        set({ scanning: false });
        void get().loadGraph();
      },
      error: (msg) => set({ scanning: false, scanError: msg }),
    });
  },
  stopScan: () => {
    stopScanFn?.();
    stopScanFn = null;
    set({ scanning: false });
  },

  startups: [],
  loadStartups: async () => set({ startups: await api.startups() }),
  setStartupStatus: async (id, status) => {
    set({ startups: get().startups.map((s) => (s.id === id ? { ...s, status } : s)) });
    await api.updateStartup(id, { status });
  },
  setStartupNotes: async (id, notes) => {
    set({ startups: get().startups.map((s) => (s.id === id ? { ...s, notes } : s)) });
    await api.updateStartup(id, { notes });
  },
  setStartupEmails: async (id, emails) => {
    const s = await api.updateStartup(id, { emails });
    set({ startups: get().startups.map((x) => (x.id === id ? s : x)) });
  },
  setStartupWebsite: async (id, website) => {
    await api.updateStartup(id, { website });
    const s = await api.enrichStartup(id);
    set({ startups: get().startups.map((x) => (x.id === id ? s : x)) });
  },
  reEnrich: async (id) => {
    const s = await api.enrichStartup(id);
    set({ startups: get().startups.map((x) => (x.id === id ? s : x)) });
  },
  removeStartup: async (id) => {
    set({ startups: get().startups.filter((s) => s.id !== id), selectedStartup: get().selectedStartup === id ? null : get().selectedStartup });
    await api.deleteStartup(id);
  },
  selectedStartup: null,
  selectStartup: (selectedStartup) => set({ selectedStartup }),

  startupScanning: false,
  startupTasks: {},
  startupPhase: "",
  startupProgress: { done: 0, total: 0, added: 0 },
  startupError: null,
  startStartupScan: (req) => {
    stopStartupFn?.();
    set({ startupScanning: true, startupTasks: {}, startupPhase: "news", startupProgress: { done: 0, total: 0, added: 0 }, startupError: null });
    stopStartupFn = api.scanStartups(req, {
      task: (t) => set({ startupTasks: { ...get().startupTasks, [t.label]: t } }),
      startup: ({ startup, isNew }) => {
        const list = get().startups;
        set({ startups: isNew ? [startup, ...list] : list.map((s) => (s.id === startup.id ? startup : s)) });
      },
      phase: ({ phase, total }) => set({ startupPhase: phase, startupProgress: { done: 0, total, added: get().startupProgress.added } }),
      progress: (p) => set({ startupProgress: p }),
      done: () => {
        set({ startupScanning: false, startupPhase: "done" });
        void get().loadGraph();
      },
      error: (msg) => set({ startupScanning: false, startupError: msg }),
    });
  },
  stopStartupScan: () => {
    stopStartupFn?.();
    stopStartupFn = null;
    set({ startupScanning: false });
  },

  outreach: [],
  loadOutreach: async () => set({ outreach: await api.outreach() }),
  draftOutreach: async (startupId, to) => {
    const o = await api.draftOutreach(startupId, to);
    set({ outreach: [o, ...get().outreach], selectedOutreach: o.id });
    return o;
  },
  updateOutreach: async (id, patch) => {
    set({ outreach: get().outreach.map((o) => (o.id === id ? { ...o, ...patch } : o)) });
    await api.updateOutreach(id, patch);
  },
  sendOutreach: async (id) => {
    let o: Outreach;
    try {
      o = await api.sendOutreach(id);
    } catch (e) {
      await get().loadOutreach();
      throw e;
    }
    set({ outreach: get().outreach.map((x) => (x.id === id ? o : x)) });
    await Promise.all([get().loadStartups(), get().loadGraph()]);
    return o;
  },
  checkReplies: async () => {
    const res = await api.checkReplies();
    await Promise.all([get().loadOutreach(), get().loadStartups(), get().loadSettings(), get().loadGraph()]);
    return res;
  },
  removeOutreach: async (id) => {
    set({ outreach: get().outreach.filter((o) => o.id !== id), selectedOutreach: get().selectedOutreach === id ? null : get().selectedOutreach });
    await api.deleteOutreach(id);
  },
  selectedOutreach: null,
  selectOutreach: (selectedOutreach) => set({ selectedOutreach }),

  graph: null,
  loadGraph: async () => set({ graph: await api.graph() }),
  setGraph: (graph) => set({ graph }),
}));

// Back/forward buttons and pasted #links.
window.addEventListener("hashchange", () => useStore.setState({ view: viewFromHash() }));
