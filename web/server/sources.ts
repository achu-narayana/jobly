import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import type { Lead, Source } from "./types.js";

/** A lead before it has been scored and given a status. */
export type RawLead = Omit<Lead, "match" | "status" | "notes">;

interface ReachItem {
  title: string;
  url: string;
  author: string | null;
  published_at: string | null;
  text: string;
}
interface ReachResponse {
  ok: boolean;
  items?: ReachItem[];
  error?: { code: string; message: string } | null;
}

const AGENT_REACH = process.env.JOBLY_AGENT_REACH ?? "agent-reach";

/** Run one agent-reach command and parse its JSON envelope. */
export function reach(args: string[], timeoutSec = 120): Promise<ReachResponse> {
  return new Promise((resolve, reject) => {
    const child = spawn(AGENT_REACH, [...args, "--timeout", String(timeoutSec)], {
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });
    let out = "";
    let err = "";
    child.stdout.setEncoding("utf8").on("data", (d) => (out += d));
    child.stderr.setEncoding("utf8").on("data", (d) => (err += d));
    const killer = setTimeout(() => child.kill(), (timeoutSec + 15) * 1000);
    child.on("error", (e) => {
      clearTimeout(killer);
      reject(new Error(`agent-reach not runnable (${e.message}). Install it: https://github.com/Panniantong/Agent-Reach`));
    });
    child.on("close", () => {
      clearTimeout(killer);
      const start = out.indexOf("{");
      if (start < 0) return reject(new Error(err.trim() || "agent-reach returned no JSON"));
      try {
        resolve(JSON.parse(out.slice(start)) as ReachResponse);
      } catch (e) {
        reject(new Error(`bad agent-reach output: ${(e as Error).message}`));
      }
    });
  });
}

const id = (source: Source, key: string) => `${source}_${createHash("sha1").update(key).digest("hex").slice(0, 12)}`;
const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const AGO = /(\d+\s+(?:minute|hour|day|week|month)s?\s+ago)/i;

function titleCase(s: string) {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

const alnum = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * "Sainsbury's London, England" with slug company "Sainsbury S" →
 * { company: "Sainsbury's", rest: "London, England" }. The card spelling wins over the slug.
 */
function splitCompanyPrefix(card: string, company: string): { company: string; rest: string } {
  if (!company) return { company, rest: card };
  const target = alnum(company);
  let seen = "";
  for (let i = 0; i < card.length; i++) {
    const ch = card[i].toLowerCase();
    if (/[a-z0-9]/.test(ch)) seen += ch;
    if (seen === target) return { company: card.slice(0, i + 1), rest: card.slice(i + 1) };
    if (!target.startsWith(seen)) break;
  }
  return { company, rest: card };
}

// ---------------------------------------------------------------- LinkedIn

function parseLinkedIn(item: ReachItem, query: string): RawLead | null {
  const url = item.url.split("?")[0];
  const m = url.match(/\/jobs\/view\/(?:([a-z0-9-]+?)-at-([a-z0-9-]+?))?-?(\d{6,})\/?$/i);
  if (!m) return null;
  const jobId = m[3];

  let title = "";
  let company = "";
  let location = "";

  const hiring = item.title.match(/^(.+?) hiring (.+?) in (.+?)(?: \| LinkedIn)?$/);
  const atDash = item.title.match(/^(.+?) at (.+?) [—–-] (.+)$/);
  if (hiring) [, company, title, location] = hiring;
  else if (atDash) [, title, company, location] = atDash;
  else {
    title = item.title.replace(/\s*\|\s*LinkedIn$/, "");
    if (m[1] && m[2]) {
      title = titleCase(m[1].replace(/-/g, " "));
      company = titleCase(m[2].replace(/-/g, " "));
    }
  }

  // The text starts with a card: "#### Company Location 3 days ago 181 applicants"
  const text = item.text ?? "";
  if (!location) {
    const card = text.match(/^#{1,4}\s*(.+?)\s+\d+\s+(?:minute|hour|day|week|month)s?\s+ago/m)?.[1] ?? "";
    if (card) {
      const split = splitCompanyPrefix(card, company);
      company = clean(split.company);
      location = clean(split.rest);
      if (!company && card) {
        // No slug company: assume the location is the trailing "City, Country" part.
        const parts = card.split(/\s{2,}|(?<=\w)\s(?=[A-Z][a-z]+,)/);
        company = clean(parts[0] ?? "");
        location = clean(card.slice(company.length));
      }
    }
  }
  const noSuffix = (s: string) => s.replace(/\s*\|\s*LinkedIn.*$/i, "");
  title = noSuffix(title);
  location = noSuffix(location);
  if (!company) company = "Unknown company";
  if (!location) location = "Unspecified";

  const applicants = text.match(/(\d+)\s+applicants/i)?.[1];
  const body = text
    .replace(/^#{1,6}\s.*$/gm, "")
    .replace(/^\s*(Apply|Save|Apply Save|Join now|Sign in)\s*$/gm, "")
    .replace(/See who .* has hired for this role/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    id: id("linkedin", jobId),
    source: "linkedin",
    title: clean(title),
    company: clean(company),
    location: clean(location),
    url,
    text: body,
    postedAgo: text.match(AGO)?.[1] ?? null,
    applicants: applicants ? Number(applicants) : null,
    query,
    fetchedAt: new Date().toISOString(),
  };
}

export async function searchLinkedIn(query: string, location: string | null, limit: number): Promise<RawLead[]> {
  const args = ["linkedin", "jobs", query, "--limit", String(limit), "--backend", "public-web"];
  if (location) args.push("--location", location);
  const res = await reach(args, 150);
  if (!res.ok) throw new Error(res.error?.message ?? "LinkedIn search failed");
  return (res.items ?? []).map((i) => parseLinkedIn(i, query)).filter((x): x is RawLead => !!x);
}

// ---------------------------------------------------------------- RemoteOK (via Jina reader)

const FLAG = /[\u{1F1E6}-\u{1F1FF}]{2}|🌏|🌎|🌍|💰/u;

function parseRemoteOk(text: string, query: string, pageUrl: string): RawLead[] {
  const leads: RawLead[] = [];
  for (const chunk of text.split(/\n\s*Apply\s*\n/)) {
    if (/PROMOTED|Post a job|SafetyWing/i.test(chunk)) continue;
    const lines = chunk.split("\n").map((l) => l.trim()).filter(Boolean);
    // Walk backwards from the end: "...title, company, location-line, tags..., age"
    const age = lines.findLast((l) => /^\d+(d|mo|h|w|y)$/.test(l));
    const locIdx = lines.findIndex((l) => FLAG.test(l));
    if (locIdx < 2) continue;
    const title = lines[locIdx - 2];
    const company = lines[locIdx - 1];
    const locLine = lines[locIdx]
      .replace(/💰.*$/, "")
      .replace(/[\u{1F1E6}-\u{1F1FF}]{2}|🌏|🌎|🌍|💃|🏄/gu, "·")
      .split("·")
      .map(clean)
      .filter(Boolean);
    const salary = lines[locIdx].match(/\$[\d,k]+\s*-\s*\$[\d,k]+/)?.[0];
    const tags = lines.slice(locIdx + 1).filter((l) => !/^\d+(d|mo|h|w|y)$/.test(l) && l !== "VERIFIED");
    if (!title || !company || /^(Developer|Design|Remote)$/.test(title)) continue;
    leads.push({
      id: id("remoteok", `${title}|${company}`),
      source: "remoteok",
      title: clean(title.replace(/VERIFIED$/, "")),
      company: clean(company),
      location: `Remote · ${locLine.slice(0, 3).join(", ") || "Worldwide"}`,
      url: `${pageUrl}#${encodeURIComponent(title)}`,
      text: [salary ? `Salary ${salary}` : "", tags.length ? `Tags: ${tags.join(", ")}` : "", "Listed on RemoteOK."].filter(Boolean).join("\n"),
      postedAgo: age ? age.replace(/(\d+)([a-z]+)/, "$1$2 ago") : null,
      applicants: null,
      query,
      fetchedAt: new Date().toISOString(),
    });
  }
  return leads;
}

/** Jina sometimes returns the page as a Markdown table: one row per job with real links. */
function parseRemoteOkMarkdown(text: string, query: string): RawLead[] {
  const leads: RawLead[] = [];
  const rowRe = /## \[([^\]]+)\]\((https:\/\/remoteok\.com\/remote-jobs\/[^)]+)\)([^|]*)\|([^|]*)\|([^|]*)\|\s*\[Apply\]\((https:\/\/remoteok\.com\/l\/\d+)\)/g;
  for (const m of text.matchAll(rowRe)) {
    const [, title, jobUrl, meta, tagCell, ageCell, applyUrl] = m;
    const metaText = meta.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}�]/gu, " ");
    const company = clean(metaText.match(/###\s*([^[💰$]+?)(?:\s+\[|\s+Worldwide|\s*$)/u)?.[1] ?? "");
    const locs = [...meta.matchAll(/\[(?:[^\]\w]*)([A-Za-z][^\]]*)\]\(https:\/\/remoteok\.com\/remote-jobs-in-[^)]+\)/g)].map((x) => clean(x[1]));
    if (/Worldwide/.test(meta)) locs.unshift("Worldwide");
    const salary = meta.match(/\$\s?[\d,.]+k?\s*-\s*\$\s?[\d,.]+k?/)?.[0];
    const tags = [...tagCell.matchAll(/\[([^\]]+)\]/g)].map((x) => x[1]);
    const age = ageCell.match(/(\d+)(h|d|w|mo|y)\b/);
    if (!title || !company) continue;
    leads.push({
      id: id("remoteok", jobUrl),
      source: "remoteok",
      title: clean(title),
      company,
      location: `Remote · ${locs.slice(0, 3).join(", ") || "Worldwide"}`,
      url: jobUrl || applyUrl,
      text: [salary ? `Salary ${salary.replace(/\s+/g, "")}` : "", tags.length ? `Tags: ${tags.join(", ")}` : "", "Listed on RemoteOK."].filter(Boolean).join("\n"),
      postedAgo: age ? `${age[1]}${age[2]} ago` : null,
      applicants: null,
      query,
      fetchedAt: new Date().toISOString(),
    });
  }
  return leads;
}

const REMOTEOK_TAGS = ["frontend", "backend", "fullstack", "react", "javascript", "typescript", "python", "node", "devops", "data", "design", "mobile", "ios", "android", "golang", "rust", "java", "ai", "machine learning", "product", "marketing", "sales", "security", "qa"];

export async function searchRemoteOk(query: string, limit: number): Promise<RawLead[]> {
  const q = query.toLowerCase();
  const tag = REMOTEOK_TAGS.find((t) => q.includes(t)) ?? (/engineer|developer|software/.test(q) ? "dev" : "remote");
  const pageUrl = tag === "remote" ? "https://remoteok.com/remote-jobs" : `https://remoteok.com/remote-${encodeURIComponent(tag.replace(" ", "-"))}-jobs`;
  const res = await reach(["web", "read", pageUrl], 60);
  if (!res.ok) throw new Error(res.error?.message ?? "RemoteOK read failed");
  const text = res.items?.[0]?.text ?? "";
  const all = text.includes("[Apply](https://remoteok.com/l/") ? parseRemoteOkMarkdown(text, query) : parseRemoteOk(text, query, pageUrl);
  // The tag page is not strictly filtered. Specific terms ("react", "data") must appear in the
  // title or tags; if the query is only generic role words, match those against the title.
  const GENERIC = /^(senior|junior|lead|staff|principal|engineer|developer|manager|software|full|stack|fullstack|the|and)$/;
  const words = q.split(/\s+/).filter((w) => w.length > 2);
  const specific = words.filter((w) => !GENERIC.test(w));
  const roleWords = words.filter((w) => /engineer|developer|designer|manager|analyst|scientist|architect/.test(w));
  const relevant = all.filter((l) => {
    const hay = `${l.title} ${l.text}`.toLowerCase();
    const title = l.title.toLowerCase();
    if (specific.length) return specific.some((t) => hay.includes(t)) && (!roleWords.length || roleWords.some((t) => title.includes(t)) || /developer|engineer/.test(title));
    return roleWords.some((t) => title.includes(t));
  });
  return relevant.slice(0, limit);
}

// ---------------------------------------------------------------- V2EX jobs board

export async function searchV2ex(query: string, limit: number): Promise<RawLead[]> {
  const res = await reach(["v2ex", "node", "jobs", "--limit", String(Math.max(limit, 20))], 60);
  if (!res.ok) throw new Error(res.error?.message ?? "V2EX read failed");
  const terms = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  return (res.items ?? [])
    .filter((i) => {
      const hay = `${i.title} ${i.text}`.toLowerCase();
      return terms.some((t) => hay.includes(t));
    })
    .slice(0, limit)
    .map((i) => ({
      id: id("v2ex", i.url),
      source: "v2ex" as const,
      title: clean(i.title.replace(/^\[[^\]]+\]\s*/, "")),
      company: i.author ?? "V2EX poster",
      location: i.title.match(/^\[([^\]]+)\]/)?.[1] ?? "Unspecified",
      url: i.url,
      text: i.text ?? "",
      postedAgo: i.published_at ? relative(i.published_at) : null,
      applicants: null,
      query,
      fetchedAt: new Date().toISOString(),
    }));
}

function relative(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days < 1) return "today";
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}
