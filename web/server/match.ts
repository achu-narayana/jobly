import { countSkills } from "./skills.js";
import type { Lead, MatchResult, Profile, SkillHit } from "./types.js";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

function titleSimilarity(profileTitles: string[], jobTitle: string): number {
  const jt = new Set(norm(jobTitle).split(" "));
  let best = 0;
  for (const t of profileTitles) {
    const words = norm(t).split(" ").filter((w) => w.length > 2);
    if (!words.length) continue;
    const hit = words.filter((w) => jt.has(w)).length / words.length;
    best = Math.max(best, hit);
  }
  return best;
}

function locationScore(profileLocs: string[], jobLoc: string): number {
  const jl = norm(jobLoc);
  if (!profileLocs.length) return 0.5;
  if (jl.includes("remote")) return 1;
  return profileLocs.some((l) => jl.includes(norm(l))) ? 1 : 0.2;
}

/**
 * Pure heuristic match, no models:
 *   60% skill coverage (weighted by how prominent the skill is in the resume)
 *   25% title overlap
 *   15% location
 */
export function scoreLead(profile: Profile | null, lead: Pick<Lead, "title" | "text" | "location">): MatchResult {
  const jobSkills = countSkills(`${lead.title}\n${lead.text}`);
  const jobIds = new Set(jobSkills.map((s) => s.def.id));

  if (!profile) {
    return {
      score: 0,
      matched: [],
      missing: jobSkills.slice(0, 12).map(({ def }) => ({ id: def.id, label: def.label, category: def.category, weight: 1 })),
      titleScore: 0,
      locationScore: 0,
      skillScore: 0,
    };
  }

  const mine = new Map(profile.skills.map((s) => [s.id, s]));
  const matched: SkillHit[] = [];
  const missing: SkillHit[] = [];
  let demandTotal = 0;
  let demandMet = 0;
  for (const { def, count } of jobSkills) {
    const demand = Math.min(count, 5);
    demandTotal += demand;
    const have = mine.get(def.id);
    if (have) {
      demandMet += demand;
      matched.push(have);
    } else {
      missing.push({ id: def.id, label: def.label, category: def.category, weight: demand });
    }
  }
  // Bonus for resume skills the JD also lists, weighted by resume prominence.
  const prominence = profile.skills.filter((s) => jobIds.has(s.id)).reduce((a, s) => a + s.weight, 0);
  const prominenceMax = profile.skills.slice(0, 10).reduce((a, s) => a + s.weight, 0) || 1;

  const coverage = demandTotal ? demandMet / demandTotal : 0;
  const skillScore = Math.min(1, coverage * 0.7 + Math.min(1, prominence / prominenceMax) * 0.3);
  const tScore = titleSimilarity(profile.titles, lead.title);
  const lScore = locationScore(profile.locations, lead.location);

  const score = Math.round((skillScore * 0.6 + tScore * 0.25 + lScore * 0.15) * 100);
  return {
    score,
    matched: matched.sort((a, b) => b.weight - a.weight),
    missing: missing.sort((a, b) => b.weight - a.weight).slice(0, 12),
    titleScore: tScore,
    locationScore: lScore,
    skillScore,
  };
}
