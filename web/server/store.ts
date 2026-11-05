import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DB, GraphOverlay } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(here, "..", "data");
const DB_PATH = join(DATA_DIR, "jobly.json");

export const emptyOverlay = (): GraphOverlay => ({
  removedNodes: [],
  removedLinks: [],
  renamed: {},
  pinned: {},
  customNodes: [],
  customLinks: [],
});

function load(): DB {
  if (!existsSync(DB_PATH)) return { profile: null, leads: [], overlay: emptyOverlay() };
  try {
    const raw = JSON.parse(readFileSync(DB_PATH, "utf8")) as Partial<DB>;
    return {
      profile: raw.profile ?? null,
      leads: raw.leads ?? [],
      overlay: { ...emptyOverlay(), ...(raw.overlay ?? {}) },
    };
  } catch {
    return { profile: null, leads: [], overlay: emptyOverlay() };
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
