import type { GraphData, GraphLink, GraphNode, Lead, LeadStatus, Profile, ScanRequest } from "./types";

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

export const api = {
  profile: () => fetch("/api/profile").then((r) => json<Profile | null>(r)),
  uploadResume: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return fetch("/api/resume", { method: "POST", body: fd }).then((r) => json<Profile>(r));
  },
  updateProfile: (patch: Partial<Profile>) =>
    fetch("/api/profile", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) }).then((r) => json<Profile>(r)),

  leads: () => fetch("/api/leads").then((r) => json<Lead[]>(r)),
  updateLead: (id: string, patch: { status?: LeadStatus; notes?: string }) =>
    fetch(`/api/leads/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) }).then((r) => json<Lead>(r)),
  deleteLead: (id: string) => fetch(`/api/leads/${id}`, { method: "DELETE" }).then((r) => json<null>(r)),
  clearLeads: () => fetch(`/api/leads`, { method: "DELETE" }).then((r) => json<null>(r)),

  graph: () => fetch("/api/graph").then((r) => json<GraphData>(r)),
  editGraph: (op: GraphEditOp) =>
    fetch("/api/graph/edit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(op) }).then((r) => json<GraphData>(r)),

  /** Opens the live scan stream. Returns a function that stops it. */
  scan(req: ScanRequest, on: ScanHandlers): () => void {
    const params = new URLSearchParams({
      queries: req.queries.join("|"),
      locations: req.locations.join("|"),
      sources: req.sources.join(","),
      limit: String(req.limit),
    });
    const es = new EventSource(`/api/scan?${params}`);
    es.addEventListener("start", (e) => on.start?.(JSON.parse((e as MessageEvent).data)));
    es.addEventListener("task", (e) => on.task?.(JSON.parse((e as MessageEvent).data)));
    es.addEventListener("lead", (e) => on.lead?.(JSON.parse((e as MessageEvent).data)));
    es.addEventListener("progress", (e) => on.progress?.(JSON.parse((e as MessageEvent).data)));
    es.addEventListener("done", (e) => {
      on.done?.(JSON.parse((e as MessageEvent).data));
      es.close();
    });
    es.onerror = () => {
      on.error?.("Lost connection to the scanner. Is `npm run dev` running?");
      es.close();
    };
    return () => es.close();
  },
};

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
