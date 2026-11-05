import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DB, GraphOverlay, Settings } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = join(here, "..", "data");
const DB_PATH = join(DATA_DIR, "jobly.json");

export const emptyOverlay = (): GraphOverlay => ({
  removedNodes: [],
  removedLinks: [],
  renamed: {},
  pinned: {},
  customNodes: [],
  customLinks: [],
});

export const defaultSettings = (): Settings => ({ locations: [], mail: null, lastReplyCheck: null });

function load(): DB {
  const empty: DB = { profile: null, leads: [], startups: [], outreach: [], settings: defaultSettings(), overlay: emptyOverlay() };
  if (!existsSync(DB_PATH)) return empty;
  try {
    const raw = JSON.parse(readFileSync(DB_PATH, "utf8")) as Partial<DB>;
    return {
      profile: raw.profile ? { ...raw.profile, storedFile: raw.profile.storedFile ?? null } : null,
      leads: raw.leads ?? [],
      startups: raw.startups ?? [],
      outreach: raw.outreach ?? [],
      settings: { ...defaultSettings(), ...(raw.settings ?? {}) },
      overlay: { ...emptyOverlay(), ...(raw.overlay ?? {}) },
    };
  } catch {
    return empty;
  }
}

export const db: DB = load();

let timer: NodeJS.Timeout | null = null;
/** Debounced write so a burst of streamed leads produces one disk write. */
export function persist() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  }, 150);
}
