import { createHash } from "node:crypto";
import { scoreLead } from "./match.js";
import { TITLE_WORDS } from "./resume.js";
import type { Profile, Startup } from "./types.js";
import { extractEmails, fetchPage, findWebsite, HOSTED_PLATFORM, readViaJina } from "./web.js";
import type { MatchResult } from "./types.js";

/**
 * Startup fit is not a job-description match: the signal is "they just raised,
 * they are hiring, and the roles / stack they show overlap with the resume".
 *   up to 45  skills found on their site that you have
 *   up to 35  an open role whose title matches yours
 *   +20       hiring signal (careers page, "we're hiring")
 */
export function scoreStartup(profile: Profile | null, s: Startup, text: string): MatchResult {
  const base = scoreLead(profile, { title: s.roles.join(" · "), text, location: s.location });
  if (!profile) return base;
  const score = Math.round(base.skillScore * 45 + base.titleScore * 35 + (s.hiring ? 20 : 0));
  return { ...base, score: Math.min(100, score), locationScore: 1 };
}

/**
 * Funded-startup discovery: Google News RSS (no key) for funding headlines,
 * then each company's own site for description, careers page and emails.
 */

/** What to search for each location preset. Remote has no place term. */
export const LOCATION_TERMS: Record<string, string[]> = {
  Hyderabad: ["Hyderabad"],
  Bangalore: ["Bengaluru", "Bangalore"],
  Pune: ["Pune"],
  Chennai: ["Chennai"],
  Mumbai: ["Mumbai"],
  "Delhi NCR": ["Delhi", "Gurugram", "Noida"],
  Kolkata: ["Kolkata"],
  Ahmedabad: ["Ahmedabad"],
  India: ["India"],
  Remote: ["remote-first"],
  London: ["London"],
  Berlin: ["Berlin"],
  Singapore: ["Singapore"],
  Dubai: ["Dubai"],
  "New York": ["New York"],
  "San Francisco": ["San Francisco", "Bay Area"],
};

interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
}

function decode(s: string) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

async function googleNews(query: string): Promise<NewsItem[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;
  const page = await fetchPage(url, 15000);
  if (!page || page.status !== 200) return [];
  return [...page.html.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, it]) => ({
    title: decode(it.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? ""),
    link: decode(it.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? ""),
    pubDate: it.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? "",
    source: decode(it.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] ?? ""),
  }));
}

const VERB = /\b(raises|raised|secures|secured|bags|lands|closes|nets|mops up|picks up|snags|scoops up|gets|wins|clinches|rakes in|pockets|garners)\b/i;
const DESCRIPTOR = /\b(startup|start-up|firm|company|platform|maker|brand|app|unicorn|developer|provider|player|venture|marketplace|studio|network|lab|labs)\b/i;
const SKIP = /funding wrap|roundup|round-up|this week|weekly|top \d+|list of|these \d+|how to|explained|opinion|\?$/i;
const AMOUNT = /(\$|₹|Rs\.?|INR|USD|€|£)\s?([\d.,]+)\s*(million|mn|mln|m\b|crore|cr\b|billion|bn|b\b|k\b|lakh|lakhs)?/i;
const ROUND = /\b(pre-seed|seed|angel|bridge|pre-series ?[a-c]|series ?[a-f]\d?|growth|debt|extension|follow-on)\b(?:\s+(?:round|funding))?/i;
const INVESTORS = /\b(?:led by|from|backed by|with participation from)\s+([^.,;]{3,80}?)(?=\s+(?:to|for|as|at|and others|in a)\b|[.,;]|$)/i;

export interface FundingHit {
  name: string;
  amount: string | null;
  round: string | null;
  investors: string | null;
  item: NewsItem;
}

/** Turn "Hyderabad physical AI startup Tensrai raises Rs 3.4 crore to…" into a company name. */
export function parseHeadline(rawTitle: string): Omit<FundingHit, "item"> | null {
  const title = rawTitle.replace(/\s+-\s+[^-]+$/, "").trim(); // drop " - Source"
  if (SKIP.test(title)) return null;
  const v = title.match(VERB);
  if (!v || v.index == null) return null;
  let before = title.slice(0, v.index).replace(/[:|–—-]\s*$/, "").trim();
  if (!before || before.includes(",") || /\band\b/i.test(before)) return null; // multiple companies

  // Everything after the last descriptor word is the name: "Edtech firm byteXL" → "byteXL".
  const parts = before.split(/\s+/);
  let lastDesc = -1;
  parts.forEach((w, i) => {
    if (DESCRIPTOR.test(w) || /-based$/i.test(w)) lastDesc = i;
  });
  if (lastDesc >= 0) before = parts.slice(lastDesc + 1).join(" ");
  // "Hyderabad's Tensrai" / "Hyderabad-based Tensrai"
  before = before.replace(/^[A-Z][\w.]+'s\s+/, "").replace(/^(the)\s+/i, "");
  const name = before.replace(/[“”"']/g, "").trim();
  if (!name || name.length < 2 || name.length > 40 || /^(it|its|this|that|startup|startups|company)$/i.test(name)) return null;

  const after = title.slice(v.index);
  const a = after.match(AMOUNT);
  const amount = a ? `${a[1].replace(/\.$/, "").replace(/^Rs$/i, "₹")}${a[2]}${a[3] ? " " + a[3].replace(/^mn$|^mln$|^m$/i, "million").replace(/^cr$/i, "crore").replace(/^bn$|^b$/i, "billion") : ""}` : null;
  const round = after.match(ROUND)?.[1]?.replace(/\s+/g, " ") ?? null;
  const investors = after.match(INVESTORS)?.[1]?.trim() ?? null;
  return { name, amount, round: round ? round[0].toUpperCase() + round.slice(1) : null, investors };
}

export async function discoverFunding(location: string | null, days: number): Promise<FundingHit[]> {
  const terms = location ? (LOCATION_TERMS[location] ?? [location]) : [""];
  const seen = new Map<string, FundingHit>();
  for (const term of terms) {
    const queries = [`${term} startup raises funding when:${days}d`, `${term} startup "series" OR "seed" funding round when:${days}d`];
    for (const q of queries) {
      for (const item of await googleNews(q.trim())) {
        const parsed = parseHeadline(item.title);
        if (!parsed) continue;
        const key = parsed.name.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (!key || seen.has(key)) continue;
        seen.set(key, { ...parsed, item });
      }
    }
  }
  return [...seen.values()];
}

const id = (name: string) => `st_${createHash("sha1").update(name.toLowerCase().replace(/[^a-z0-9]/g, "")).digest("hex").slice(0, 12)}`;

export function startupFromHit(hit: FundingHit, location: string | null, profile: Profile | null): Startup {
  const base: Omit<Startup, "match"> = {
    id: id(hit.name),
    name: hit.name,
    location: location ?? "Anywhere",
    amount: hit.amount,
    round: hit.round,
    investors: hit.investors,
    announcedAt: hit.item.pubDate ? new Date(hit.item.pubDate).toISOString() : new Date().toISOString(),
    newsTitle: hit.item.title.replace(/\s+-\s+[^-]+$/, ""),
    newsUrl: hit.item.link,
    newsSource: hit.item.source || "Google News",
    website: null,
    description: "",
    emails: [],
    careersUrl: null,
    roles: [],
    hiring: false,
    status: "new",
    notes: "",
    fetchedAt: new Date().toISOString(),
    enriched: false,
    enrichError: null,
  };
  const draft = { ...base, match: { score: 0, matched: [], missing: [], titleScore: 0, locationScore: 1, skillScore: 0 } };
  return { ...draft, match: scoreStartup(profile, draft, base.newsTitle) };
}

const CAREER_PATHS = ["/careers", "/jobs", "/career", "/join-us", "/join", "/work-with-us", "/openings", "/about"];
const HIRING_SIGNAL = /we('| a)re hiring|open (roles|positions)|join (our|the) team|current openings|apply now|view (all )?(open )?(roles|positions|jobs)/i;

/** Visit the company's site: description, emails, careers page, detected roles. Mutates and returns the startup. */
export async function enrichStartup(s: Startup, profile: Profile | null): Promise<Startup> {
  try {
    const website = s.website ?? (await findWebsite(s.name, s.location === "Anywhere" ? "startup" : `${s.location} startup`));
    s.roles = [];
    s.emails = s.emails.filter((e) => e.source === "found" && e.address.includes("@") && !/\?$/.test(e.address));
    if (!website) throw new Error("website not found");
    s.website = website;
    const domain = new URL(website).host.replace(/^www\./, "");

    const home = await fetchPage(website);
    let homeText = home?.text ?? "";
    if (homeText.length < 300) homeText = (await readViaJina(website)) ?? homeText;
    const html = home?.html ?? "";
    s.description = (home?.title ? home.title + ". " : "") + homeText.replace(/\n+/g, " ").slice(0, 600);

    // Careers page: a link on the homepage first, then common paths.
    const linked = [...html.matchAll(/href="([^"]*(?:career|jobs|join-us|openings|hiring)[^"]*)"/gi)].map((m) => m[1]).find((h) => !/\.(pdf|png|jpg)$/i.test(h));
    const candidates = [linked ? new URL(linked, website).toString() : null, ...CAREER_PATHS.map((p) => website + p)].filter((u): u is string => !!u);
    let careersHtml = "";
    let careersText = "";
    for (const u of candidates.slice(0, 5)) {
      const p = await fetchPage(u, 10000);
      if (p && p.status === 200 && p.text.length > 400 && !/404|not found/i.test(p.title)) {
        s.careersUrl = p.url;
        careersHtml = p.html;
        careersText = p.text;
        break;
      }
    }
    if (s.careersUrl && careersText.length < 800) careersText = (await readViaJina(s.careersUrl)) ?? careersText;

    const roles = new Set<string>();
    for (const m of careersText.matchAll(TITLE_WORDS)) roles.add(m[1].replace(/\s+/g, " ").trim().replace(/\b\w/g, (c) => c.toUpperCase()));
    s.roles = [...roles].slice(0, 12);
    s.hiring = s.roles.length > 0 || HIRING_SIGNAL.test(careersText) || HIRING_SIGNAL.test(homeText);

    const found = extractEmails(html + "\n" + careersHtml + "\n" + careersText, domain);
    s.emails = found.map((address) => ({ address, source: "found" as const }));
    if (!s.emails.length && !HOSTED_PLATFORM.test(domain)) s.emails = [`careers@${domain}`, `hello@${domain}`].map((address) => ({ address, source: "guessed" as const }));

    s.match = scoreStartup(profile, s, `${s.description}\n${careersText.slice(0, 6000)}`);
    s.enriched = true;
    s.enrichError = null;
  } catch (e) {
    s.enriched = true;
    s.enrichError = (e as Error).message;
  }
  return s;
}
