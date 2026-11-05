import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { countSkills } from "./skills.js";
import type { Profile, SkillHit } from "./types.js";

export async function extractText(fileName: string, buf: Buffer): Promise<string> {
  const ext = fileName.toLowerCase().split(".").pop();
  if (ext === "pdf") {
    const parser = new PDFParse({ data: new Uint8Array(buf) });
    try {
      const res = await parser.getText();
      return res.text;
    } finally {
      await parser.destroy();
    }
  }
  if (ext === "docx") {
    const res = await mammoth.extractRawText({ buffer: buf });
    return res.value;
  }
  return buf.toString("utf8");
}

export const TITLE_WORDS =
  /\b((?:senior|junior|lead|staff|principal|head of|chief|associate|intern)?\s*(?:software|frontend|front-end|front end|backend|back-end|back end|full[- ]?stack|data|machine learning|ml|ai|devops|cloud|platform|mobile|ios|android|qa|security|site reliability|product|ux|ui|embedded|systems?)\s+(?:engineer|developer|scientist|analyst|architect|designer|manager|lead|specialist|consultant))\b/gi;

const LOCATION_HINTS = [
  "london", "manchester", "birmingham", "edinburgh", "dublin", "berlin", "munich", "paris", "amsterdam",
  "madrid", "barcelona", "lisbon", "zurich", "stockholm", "copenhagen", "oslo", "warsaw", "prague",
  "new york", "san francisco", "seattle", "austin", "boston", "chicago", "los angeles", "denver", "toronto",
  "vancouver", "montreal", "sydney", "melbourne", "singapore", "tokyo", "seoul", "hong kong", "shanghai",
  "beijing", "shenzhen", "hangzhou", "bengaluru", "bangalore", "hyderabad", "pune", "mumbai", "delhi",
  "chennai", "gurgaon", "noida", "dubai", "tel aviv", "cape town", "lagos", "nairobi", "são paulo",
  "mexico city", "buenos aires", "remote", "united kingdom", "united states", "india", "germany", "canada",
];

function titleCase(s: string) {
  return s.replace(/\s+/g, " ").trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function buildProfile(fileName: string, rawText: string): Profile {
  const text = rawText.replace(/\r/g, "");
  const lower = text.toLowerCase();

  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] ?? null;

  // Name: first short, letters-only line that isn't a heading we recognise.
  const name =
    text
      .split("\n")
      .map((l) => l.trim())
      .find((l) => /^[A-Za-z][A-Za-z .'-]{2,40}$/.test(l) && l.split(" ").length <= 4 && !/resume|cv|curriculum/i.test(l)) ??
    "You";

  const titleCounts = new Map<string, number>();
  for (const m of text.matchAll(TITLE_WORDS)) {
    const t = titleCase(m[1]);
    titleCounts.set(t, (titleCounts.get(t) ?? 0) + 1);
  }
  const titles = [...titleCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t]) => t);

  const locations = LOCATION_HINTS.filter((l) => lower.includes(l)).slice(0, 4).map(titleCase);

  const yrs = [...text.matchAll(/(\d{1,2})\+?\s*(?:years|yrs)/gi)].map((m) => Number(m[1])).filter((n) => n > 0 && n < 40);
  const yearsExperience = yrs.length ? Math.max(...yrs) : null;

  const counts = countSkills(text);
  const max = counts[0]?.count ?? 1;
  const skills: SkillHit[] = counts.slice(0, 40).map(({ def, count }) => ({
    id: def.id,
    label: def.label,
    category: def.category,
    weight: Math.max(1, Math.round((count / max) * 10)),
  }));

  const headline = titles[0] ? `${titles[0]}${yearsExperience ? ` · ${yearsExperience}+ yrs` : ""}` : "Candidate";

  return {
    name,
    email,
    headline,
    titles,
    locations,
    skills,
    yearsExperience,
    rawText: text.slice(0, 20000),
    fileName,
    storedFile: null,
    updatedAt: new Date().toISOString(),
  };
}
