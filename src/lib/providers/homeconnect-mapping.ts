import { promises as fs } from "node:fs";
import type { HomeConnectEntry } from "@/lib/types";
import { env } from "@/lib/env";
import { log } from "@/lib/logger";

export interface RawEntry {
  key: string;
  value: string | number | boolean | null;
  unit: string | null;
  source: HomeConnectEntry["source"];
}

export interface KeyMapping {
  label?: string;
  unit?: string;
  hidden?: boolean;
  format?: "minutes";
  values?: Record<string, string>;
}

export interface HomeConnectMapping {
  /** "all": unmapped keys are shown as well; "mapped": only keys listed in `keys`. */
  mode: "all" | "mapped";
  keys: Record<string, KeyMapping>;
  /** Global whitelist incl. display order; per-appliance `include` overrides it. */
  include?: string[];
  /** Optional whitelist per appliance type (e.g. "Dishwasher") or haId; also defines order. */
  appliances: Record<string, { include?: string[] }>;
}

const DEFAULT_MAPPING: HomeConnectMapping = { mode: "all", keys: {}, appliances: {} };

export async function loadMapping(): Promise<HomeConnectMapping> {
  try {
    const parsed = JSON.parse(await fs.readFile(env().HOMECONNECT_MAPPING_PATH, "utf8")) as Partial<HomeConnectMapping>;
    return {
      mode: parsed.mode === "mapped" ? "mapped" : "all",
      keys: parsed.keys ?? {},
      include: parsed.include,
      appliances: parsed.appliances ?? {},
    };
  } catch (err) {
    log("warn", "homeconnect.mapping_unavailable", { message: err instanceof Error ? err.message : "unknown" });
    return DEFAULT_MAPPING;
  }
}

function lastSegment(key: string) {
  return key.slice(key.lastIndexOf(".") + 1);
}

function formatValue(raw: RawEntry, mapping: KeyMapping | undefined): { display: string; unit: string | null } {
  const unit = mapping?.unit ?? raw.unit;
  const { value } = raw;
  if (value === null) {
    return { display: "--", unit };
  }
  if (typeof value === "boolean") {
    return { display: value ? "Ja" : "Nein", unit: null };
  }
  if (typeof value === "number") {
    if (mapping?.format === "minutes") {
      return { display: String(Math.round(value / 60)), unit: "min" };
    }
    return { display: String(value), unit };
  }
  const text = mapping?.values?.[value] ?? lastSegment(value);
  return { display: text, unit: null };
}

export function applyMapping(
  raw: RawEntry[],
  mapping: HomeConnectMapping,
  type: string,
  haId: string,
): HomeConnectEntry[] {
  const include = (mapping.appliances[haId] ?? mapping.appliances[type])?.include ?? mapping.include;

  const entries = raw.flatMap((item): HomeConnectEntry[] => {
    const keyMapping = mapping.keys[item.key];
    if (keyMapping?.hidden) {
      return [];
    }
    if (include) {
      if (!include.includes(item.key)) {
        return [];
      }
    } else if (mapping.mode === "mapped" && !keyMapping) {
      return [];
    }

    const { display, unit } = formatValue(item, keyMapping);
    return [
      {
        key: item.key,
        label: keyMapping?.label ?? lastSegment(item.key),
        value: item.value,
        display,
        unit,
        source: item.source,
      },
    ];
  });

  if (include) {
    entries.sort((a, b) => include.indexOf(a.key) - include.indexOf(b.key));
  }
  return entries;
}
