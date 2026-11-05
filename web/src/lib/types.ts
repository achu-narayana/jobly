export type {
  DB,
  GraphData,
  GraphLink,
  GraphNode,
  GraphOverlay,
  Lead,
  LeadStatus,
  MatchResult,
  NodeKind,
  Profile,
  ScanRequest,
  SkillHit,
  Source,
} from "../../server/types";

export const SOURCES: { id: "linkedin" | "remoteok" | "v2ex"; label: string; hint: string }[] = [
  { id: "linkedin", label: "LinkedIn", hint: "Public job postings, full descriptions" },
  { id: "remoteok", label: "RemoteOK", hint: "Remote-only board, salaries + tags" },
  { id: "v2ex", label: "V2EX Jobs", hint: "Developer community board (CN/EN)" },
];

export const STATUSES: { id: "new" | "saved" | "applied" | "interview" | "rejected"; label: string }[] = [
  { id: "new", label: "New" },
  { id: "saved", label: "Saved" },
  { id: "applied", label: "Applied" },
  { id: "interview", label: "Interview" },
  { id: "rejected", label: "Passed" },
];
