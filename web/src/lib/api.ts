import type { GraphData, GraphLink, GraphNode, Lead, LeadStatus, MailSettings, Outreach, Profile, ScanRequest, Settings, Startup, StartupStatus } from "./types";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = res.statusText;
    try {
      msg = ((await res.json()) as { error?: string }).error ?? msg;
    } catch {
      /* not json */
    }
    throw new Error(msg);
  }
  return (res.status === 204 ? null : await res.json()) as T;
}

const J = { "content-type": "application/json" };
const post = <T,>(url: string, body?: unknown) => fetch(url, { method: "POST", headers: J, body: body === undefined ? undefined : JSON.stringify(body) }).then((r) => json<T>(r));
const patch = <T,>(url: string, body: unknown) => fetch(url, { method: "PATCH", headers: J, body: JSON.stringify(body) }).then((r) => json<T>(r));
const put = <T,>(url: string, body: unknown) => fetch(url, { method: "PUT", headers: J, body: JSON.stringify(body) }).then((r) => json<T>(r));
const del = (url: string) => fetch(url, { method: "DELETE" }).then((r) => json<null>(r));

export type SettingsResponse = Settings & { locationPresets: string[] };

export const api = {
  profile: () => fetch("/api/profile").then((r) => json<Profile | null>(r)),
  uploadResume: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return fetch("/api/resume", { method: "POST", body: fd }).then((r) => json<Profile>(r));
  },
  updateProfile: (p: Partial<Profile>) => put<Profile>("/api/profile", p),

  settings: () => fetch("/api/settings").then((r) => json<SettingsResponse>(r)),
  updateSettings: (p: { locations?: string[]; mail?: MailSettings | null }) => put<SettingsResponse>("/api/settings", p),
  testMail: () => post<{ smtp: string; imap: string }>("/api/settings/mail/test"),

  leads: () => fetch("/api/leads").then((r) => json<Lead[]>(r)),
  updateLead: (id: string, p: { status?: LeadStatus; notes?: string }) => patch<Lead>(`/api/leads/${id}`, p),
  deleteLead: (id: string) => del(`/api/leads/${id}`),
  clearLeads: () => del(`/api/leads`),

  startups: () => fetch("/api/startups").then((r) => json<Startup[]>(r)),
  updateStartup: (id: string, p: { status?: StartupStatus; notes?: string; emails?: string[]; website?: string | null }) => patch<Startup>(`/api/startups/${id}`, p),
  enrichStartup: (id: string) => post<Startup>(`/api/startups/${id}/enrich`),
  deleteStartup: (id: string) => del(`/api/startups/${id}`),

  outreach: () => fetch("/api/outreach").then((r) => json<Outreach[]>(r)),
  draftOutreach: (startupId: string, to?: string) => post<Outreach>("/api/outreach/draft", { startupId, to }),
  updateOutreach: (id: string, p: Partial<Pick<Outreach, "to" | "subject" | "body" | "attachResume">>) => patch<Outreach>(`/api/outreach/${id}`, p),
  sendOutreach: (id: string) => post<Outreach>(`/api/outreach/${id}/send`),
  checkReplies: () => post<{ checked: number; updated: string[] }>("/api/outreach/check"),
  deleteOutreach: (id: string) => del(`/api/outreach/${id}`),

  graph: () => fetch("/api/graph").then((r) => json<GraphData>(r)),
  editGraph: (op: GraphEditOp) => post<GraphData>("/api/graph/edit", op),

  /** Opens the live job scan stream. Returns a function that stops it. */
  scan(req: ScanRequest, on: ScanHandlers): () => void {
    const params = new URLSearchParams({ queries: req.queries.join("|"), locations: req.locations.join("|"), sources: req.sources.join(","), limit: String(req.limit) });
    return sse(`/api/scan?${params}`, on);
  },

  /** Opens the funded-startup scan stream. */
  scanStartups(req: { locations: string[]; days: number; limit: number }, on: StartupScanHandlers): () => void {
    const params = new URLSearchParams({ locations: req.locations.join("|"), days: String(req.days), limit: String(req.limit) });
    return sse(`/api/startups/scan?${params}`, on);
  },
};

function sse(url: string, handlers: ScanHandlers | StartupScanHandlers): () => void {
  const on = handlers as Record<string, ((d: never) => void) | undefined>;
  const es = new EventSource(url);
  for (const ev of ["start", "task", "lead", "startup", "phase", "progress"]) {
    es.addEventListener(ev, (e) => on[ev]?.(JSON.parse((e as MessageEvent).data) as never));
  }
  es.addEventListener("done", (e) => {
    on.done?.(JSON.parse((e as MessageEvent).data) as never);
    es.close();
  });
  es.onerror = () => {
    (on.error as ((m: string) => void) | undefined)?.("Lost connection to the scanner. Is `npm run dev` running?");
    es.close();
  };
  return () => es.close();
}

export type GraphEditOp =
  | { op: "removeNode"; id: string }
  | { op: "removeLink"; source: string; target: string }
  | { op: "rename"; id: string; label: string }
  | { op: "pin"; id: string; fx: number; fy: number; fz: number }
  | { op: "unpin"; id: string }
  | { op: "addNode"; node: GraphNode }
  | { op: "addLink"; link: GraphLink }
  | { op: "restore"; id: string }
  | { op: "reset" };

export interface TaskEvent {
  label: string;
  state: "running" | "done" | "error";
  count?: number;
  fresh?: number;
  error?: string;
}

export interface ScanHandlers {
  start?: (d: { total: number }) => void;
  task?: (d: TaskEvent) => void;
  lead?: (d: { lead: Lead; isNew: boolean }) => void;
  progress?: (d: { done: number; total: number; added: number }) => void;
  done?: (d: { added: number; total: number }) => void;
  error?: (msg: string) => void;
}

export interface StartupScanHandlers {
  start?: (d: { locations: string[]; days: number }) => void;
  task?: (d: TaskEvent) => void;
  startup?: (d: { startup: Startup; isNew: boolean }) => void;
  phase?: (d: { phase: string; total: number }) => void;
  progress?: (d: { done: number; total: number; added: number }) => void;
  done?: (d: { added: number; enriched: number; total: number }) => void;
  error?: (msg: string) => void;
}
