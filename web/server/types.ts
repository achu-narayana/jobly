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
  /** Path of the stored original file, used as the outreach attachment. */
  storedFile: string | null;
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

// ------------------------------------------------------------------ funded startups

export type StartupStatus = "new" | "shortlisted" | "contacted" | "replied" | "ignored";

export interface ContactEmail {
  address: string;
  /** found on the site, or guessed from the domain */
  source: "found" | "guessed";
}

export interface Startup {
  id: string;
  name: string;
  location: string;
  amount: string | null;
  round: string | null;
  investors: string | null;
  announcedAt: string;
  newsTitle: string;
  newsUrl: string;
  newsSource: string;
  website: string | null;
  /** true when the user typed the website; auto re-checks then keep it */
  websiteManual?: boolean;
  description: string;
  emails: ContactEmail[];
  careersUrl: string | null;
  /** Role titles detected on the careers page */
  roles: string[];
  hiring: boolean;
  match: MatchResult;
  status: StartupStatus;
  notes: string;
  fetchedAt: string;
  enriched: boolean;
  enrichError: string | null;
}

// ------------------------------------------------------------------ outreach

export type OutreachStatus = "draft" | "sent" | "failed" | "replied" | "bounced";

export interface Outreach {
  id: string;
  startupId: string;
  startupName: string;
  to: string;
  subject: string;
  body: string;
  status: OutreachStatus;
  messageId: string | null;
  sentAt: string | null;
  repliedAt: string | null;
  replyFrom: string | null;
  replySnippet: string | null;
  error: string | null;
  attachResume: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MailSettings {
  smtpHost: string;
  smtpPort: number;
  secure: boolean;
  user: string;
  pass: string;
  imapHost: string;
  imapPort: number;
  fromName: string;
  fromEmail: string;
  signature: string;
}

export interface Settings {
  /** Location presets the user ticked; shared by job and startup scans. */
  locations: string[];
  mail: MailSettings | null;
  lastReplyCheck: string | null;
}

// ------------------------------------------------------------------ graph

export type NodeKind = "you" | "skill" | "job" | "startup" | "company" | "location" | "source" | "custom";

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
  startups: Startup[];
  outreach: Outreach[];
  settings: Settings;
  overlay: GraphOverlay;
}
