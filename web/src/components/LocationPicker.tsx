import { useState } from "react";
import { LOCATION_GROUPS } from "../lib/types";
import { useStore } from "../store";
import { Chip } from "./ui";

/**
 * Shared location presets (India cities, Remote, global hubs) plus free text.
 * The selection is saved in settings so the job scan and the startup scan agree.
 */
export function LocationPicker({ compact = false }: { compact?: boolean }) {
  const settings = useStore((s) => s.settings);
  const setLocations = useStore((s) => s.setLocations);
  const selected = settings?.locations ?? [];
  const [draft, setDraft] = useState("");

  const toggle = (loc: string) => void setLocations(selected.includes(loc) ? selected.filter((x) => x !== loc) : [...selected, loc]);
  const addCustom = () => {
    const v = draft.trim();
    if (v && !selected.includes(v)) void setLocations([...selected, v]);
    setDraft("");
  };
  const presets = new Set(LOCATION_GROUPS.flatMap((g) => g.items));
  const custom = selected.filter((l) => !presets.has(l));

  return (
    <div className="space-y-2.5">
      {LOCATION_GROUPS.map((g) => (
        <div key={g.group} className="flex flex-wrap items-center gap-1.5">
          <span className="w-14 shrink-0 font-mono text-[10px] uppercase tracking-[0.2em] text-fg-3">{g.group}</span>
          {g.items.map((loc) => (
            <Chip key={loc} active={selected.includes(loc)} tone={selected.includes(loc) ? "accent" : "neutral"} onClick={() => toggle(loc)}>
              {loc}
            </Chip>
          ))}
        </div>
      ))}
      {!compact && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-14 shrink-0 font-mono text-[10px] uppercase tracking-[0.2em] text-fg-3">other</span>
          {custom.map((loc) => (
            <Chip key={loc} tone="accent" onRemove={() => toggle(loc)}>
              {loc}
            </Chip>
          ))}
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCustom()}
            onBlur={addCustom}
            placeholder="add a city"
            className="h-7 min-w-[120px] rounded-full border border-dashed border-line-2 bg-transparent px-3 text-xs outline-none placeholder:text-fg-3 focus:border-accent"
          />
        </div>
      )}
    </div>
  );
}
