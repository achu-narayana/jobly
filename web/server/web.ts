/**
 * Plain HTTP helpers for scraping public pages without any API keys.
 * Pages are fetched directly and stripped to text; Jina Reader is the fallback
 * for sites that need JavaScript.
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";

export interface Page {
  url: string;
  status: number;
  html: string;
  text: string;
  title: string;
}

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>|<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<\/(p|div|li|h\d|tr|br|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

export async function fetchPage(url: string, timeoutMs = 12000): Promise<Page | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml", "Accept-Language": "en" },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const html = await res.text();
    return { url: res.url || url, status: res.status, html, text: htmlToText(html), title: html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? "" };
  } catch {
    return null;
  }
}

/** Jina Reader fallback: returns clean text for JS-heavy pages. */
export async function readViaJina(url: string, timeoutMs = 25000): Promise<string | null> {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, { headers: { "User-Agent": UA, Accept: "text/plain" }, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const t = await res.text();
    if (/just a moment|attention required/i.test(t.slice(0, 400))) return null;
    // Drop Jina's own header (Title / URL Source / Warning / Markdown Content).
    return t.replace(/^(Title|URL Source|Published Time|Warning|Markdown Content):.*$/gm, "").trim();
  } catch {
    return null;
  }
}

const BLOCKED_HOSTS =
  /linkedin|crunchbase|tracxn|pitchbook|dealroom|wikipedia|facebook|twitter|x\.com|instagram|youtube|glassdoor|ambitionbox|zaubacorp|tofler|economictimes|yourstory|inc42|entrackr|techcrunch|vccircle|moneycontrol|business-standard|livemint|thehindu|indiatimes|startupnews|medium\.com|reddit|quora|apollo\.io|zoominfo|rocketreach|signalhire|cbinsights|growjo|owler|bloomberg|reuters|forbes|news\./i;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let lastSearch = 0;

async function searchUrls(query: string): Promise<string[]> {
  // Space searches out; DuckDuckGo throttles bursts.
  const wait = 1500 - (Date.now() - lastSearch);
  if (wait > 0) await sleep(wait);
  lastSearch = Date.now();
  const q = encodeURIComponent(query);
  const ddg = await fetchPage(`https://html.duckduckgo.com/html/?q=${q}`);
  let urls = ddg && ddg.status === 200
    ? [...ddg.html.matchAll(/uddg=([^&"]+)/g)].map((m) => {
        try {
          return decodeURIComponent(m[1]);
        } catch {
          return "";
        }
      })
    : [];
  if (!urls.length) {
    const bing = await fetchPage(`https://www.bing.com/search?q=${q}&setlang=en`);
    urls = bing ? [...bing.html.matchAll(/<h2><a href="(https?:\/\/[^"]+)"/g)].map((m) => m[1]) : [];
  }
  return urls.filter((u) => /^https?:\/\//.test(u));
}

const PARKED = /domain (is )?for sale|buy this domain|parked|this domain|godaddy|namecheap|sedo|afternic|hugedomains|coming soon to a browser|website is coming/i;
const TLDS = ["com", "ai", "in", "io", "co", "app", "tech", "xyz", "org", "dev"];

/**
 * Primary lookup, no search engine involved: try likely domains for the name and
 * keep the first one whose page actually mentions the company.
 */
export async function guessWebsite(name: string): Promise<string | null> {
  const lower = name.toLowerCase().trim();
  const bases = new Set<string>();
  const direct = lower.replace(/[^a-z0-9.]/g, "");
  if (/\.[a-z]{2,4}$/.test(direct)) bases.add(direct); // "Hunar.AI" → hunar.ai
  const alnum = lower.replace(/[^a-z0-9]/g, "");
  const stripped = lower.replace(/(ai|labs|technologies|technology|tech|app|inc|ltd|pvt|limited|india|solutions|systems)/g, "").replace(/[^a-z0-9]/g, "");
  for (const b of [alnum, stripped]) if (b.length >= 3) for (const t of TLDS) bases.add(`${b}.${t}`);
  const candidates = [...bases].slice(0, 20);
  const token = (stripped.length >= 4 ? stripped : alnum).slice(0, 5);

  const check = async (host: string): Promise<string | null> => {
    const page = await fetchPage(`https://${host}`, 7000);
    if (!page || page.status >= 400) return null;
    const head = (page.title + " " + page.text.slice(0, 3000)).toLowerCase();
    if (PARKED.test(head)) return null;
    const mentions = head.replace(/[^a-z0-9]/g, "").includes(token) || head.includes(alnum) || head.includes(lower);
    if (!mentions) return null;
    const u = new URL(page.url);
    // A guess that redirects to an unrelated host (cent.com → someone else) is not the company.
    if (!u.host.replace(/[^a-z0-9]/g, "").includes(token)) return null;
    // Short, common-word names must appear in the page title, not just somewhere in the text.
    if (alnum.length <= 6 && !page.title.toLowerCase().replace(/[^a-z0-9]/g, "").includes(alnum)) return null;
    return `${u.protocol}//${u.host}`;
  };

  // Four at a time, first verified hit wins (ordered by candidate priority).
  for (let i = 0; i < candidates.length; i += 4) {
    const hits = await Promise.all(candidates.slice(i, i + 4).map(check));
    const hit = hits.find(Boolean);
    if (hit) return hit;
  }
  return null;
}

/** Resolve a company's website: guessed domains first, keyless web search (DDG → Bing) as fallback. */
export async function findWebsite(name: string, hint: string): Promise<string | null> {
  const guessed = await guessWebsite(name);
  if (guessed) return guessed;
  const urls = await searchUrls(`${name} ${hint} official website`);
  const token = name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6);
  const candidates = urls.filter((u) => !BLOCKED_HOSTS.test(u));
  const byName = candidates.find((u) => new URL(u).host.replace(/[^a-z0-9]/g, "").includes(token));
  const pick = byName ?? candidates[0];
  if (!pick) return null;
  const u = new URL(pick);
  return `${u.protocol}//${u.host}`;
}

/** Site builders and hosts where `careers@host` would never exist. */
export const HOSTED_PLATFORM = /\.(webflow\.io|wixsite\.com|github\.io|notion\.site|framer\.app|framer\.website|carrd\.co|vercel\.app|netlify\.app|squarespace\.com|wordpress\.com|godaddysites\.com|mystrikingly\.com|super\.site|bubbleapps\.io|glide\.page)$/i;

const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}/gi;
const JUNK_EMAIL = /\.(png|jpg|jpeg|gif|svg|webp|css|js)$|sentry|example\.|wixpress|@2x|noreply|no-reply|donotreply|u003e|\.html$/i;

export function extractEmails(html: string, domain: string | null): string[] {
  const found = new Set<string>();
  for (const m of html.match(EMAIL_RE) ?? []) {
    const e = m.toLowerCase();
    if (JUNK_EMAIL.test(e)) continue;
    // Keep addresses on the company's own domain, plus obviously-human ones elsewhere.
    if (domain && !e.endsWith(domain) && !/^(careers|jobs|hr|talent|hello|contact|info|team|founders|hiring)@/.test(e)) continue;
    found.add(e);
  }
  const rank = (e: string) => (/^(careers|jobs|hiring|talent|recruit)/.test(e) ? 0 : /^(hr|people|founders|hello|team)/.test(e) ? 1 : /^(contact|info)/.test(e) ? 2 : 3);
  return [...found].sort((a, b) => rank(a) - rank(b)).slice(0, 5);
}
