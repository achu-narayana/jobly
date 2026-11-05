import { create } from "zustand";
import { api, type TaskEvent } from "./lib/api";
import type { GraphData, Lead, LeadStatus, Profile, ScanRequest } from "./lib/types";

export type View = "home" | "resume" | "leads" | "graph";

interface State {
  view: View;
  setView: (v: View) => void;

  profile: Profile | null;
  profileLoading: boolean;
  uploadError: string | null;
  loadProfile: () => Promise<void>;
  uploadResume: (file: File) => Promise<void>;
  updateProfile: (patch: Partial<Profile>) => Promise<void>;

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
  scanProgress: { done: number; total: number; added: number };
  scanError: string | null;
  lastScanReq: ScanRequest | null;
  startScan: (req: ScanRequest) => void;
  stopScan: () => void;

  graph: GraphData | null;
  loadGraph: () => Promise<void>;
  setGraph: (g: GraphData) => void;
}

let stopScanFn: (() => void) | null = null;

const VIEWS: View[] = ["home", "resume", "leads", "graph"];
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
      // Leads were re-scored server-side.
      await get().loadLeads();
    } catch (e) {
      set({ profileLoading: false, uploadError: (e as Error).message });
    }
  },
  updateProfile: async (patch) => {
    const profile = await api.updateProfile(patch);
    set({ profile });
    await get().loadLeads();
  },

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
  lastScanReq: null,
  startScan: (req) => {
    stopScanFn?.();
    set({ scanning: true, scanTasks: {}, scanProgress: { done: 0, total: 0, added: 0 }, scanError: null, lastScanReq: req });
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

  graph: null,
  loadGraph: async () => set({ graph: await api.graph() }),
  setGraph: (graph) => set({ graph }),
}));

// Back/forward buttons and pasted #links.
window.addEventListener("hashchange", () => useStore.setState({ view: viewFromHash() }));
