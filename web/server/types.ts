export type LeadStatus = "new" | "saved" | "applied" | "interview" | "rejected";
export type Source = "linkedin" | "remoteok" | "v2ex";

export interface Profile {
  name: string;
  email: string | null;
  headline: string;
  titles: string[];
  locations: string[];
  skills: SkillHit[];
  yearsExperience: number | null;
  rawText: string;
  fileName: string;
  updatedAt: string;
}

export interface SkillHit {
  id: string;
  label: string;
  category: string;
  /** How prominent the skill is in the resume, 1..10 */
  weight: number;
}

export interface Lead {
  id: string;
  source: Source;
  title: string;
  company: string;
  location: string;
  url: string;
  text: string;
  postedAgo: string | null;
  applicants: number | null;
  query: string;
  fetchedAt: string;
  status: LeadStatus;
  notes: string;
  match: MatchResult;
}

export interface MatchResult {
  score: number;
  matched: SkillHit[];
  missing: SkillHit[];
  titleScore: number;
  locationScore: number;
  skillScore: number;
}

export type NodeKind = "you" | "skill" | "job" | "company" | "location" | "source" | "custom";

export interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string;
  /** 0..1, used for size */
  weight: number;
  meta?: Record<string, unknown>;
  fx?: number;
  fy?: number;
  fz?: number;
}

export interface GraphLink {
  source: string;
  target: string;
  kind: string;
  weight: number;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

/** User edits layered on top of the auto-built graph. */
export interface GraphOverlay {
  removedNodes: string[];
  removedLinks: string[]; // `${source}->${target}`
  renamed: Record<string, string>;
  pinned: Record<string, { fx: number; fy: number; fz: number }>;
  customNodes: GraphNode[];
  customLinks: GraphLink[];
}

export interface ScanRequest {
  queries: string[];
  locations: string[];
  sources: Source[];
  limit: number;
}

export interface DB {
  profile: Profile | null;
  leads: Lead[];
  overlay: GraphOverlay;
}
