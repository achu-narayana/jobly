export type {
  ContactEmail,
  DB,
  GraphData,
  GraphLink,
  GraphNode,
  GraphOverlay,
  Lead,
  LeadStatus,
  MailSettings,
  MatchResult,
  NodeKind,
  Outreach,
  OutreachStatus,
  Profile,
  ScanRequest,
  Settings,
  SkillHit,
  Source,
  Startup,
  StartupStatus,
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

export const STARTUP_STATUSES: { id: "new" | "shortlisted" | "contacted" | "replied" | "ignored"; label: string }[] = [
  { id: "new", label: "New" },
  { id: "shortlisted", label: "Shortlisted" },
  { id: "contacted", label: "Contacted" },
  { id: "replied", label: "Replied" },
  { id: "ignored", label: "Ignored" },
];

export const OUTREACH_STATUSES: { id: "draft" | "sent" | "replied" | "bounced" | "failed"; label: string }[] = [
  { id: "draft", label: "Draft" },
  { id: "sent", label: "Sent" },
  { id: "replied", label: "Replied" },
  { id: "bounced", label: "Bounced" },
  { id: "failed", label: "Failed" },
];

/** Location presets. Shared by the job scan and the funded-startup scan. */
export const LOCATION_GROUPS: { group: string; items: string[] }[] = [
  { group: "India", items: ["Hyderabad", "Bangalore", "Pune", "Chennai", "Mumbai", "Delhi NCR", "Kolkata", "Ahmedabad", "India"] },
  { group: "Remote", items: ["Remote"] },
  { group: "Global", items: ["London", "Berlin", "Singapore", "Dubai", "New York", "San Francisco"] },
];
