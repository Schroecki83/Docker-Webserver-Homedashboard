/**
 * Luxtronic XML parser.
 * Maps the 9 whitelisted temperature labels from the REFRESH XML payload
 * to the canonical HeatpumpSnapshot schema.
 *
 * Field mapping (plan):
 *   Vorlauf              -> vorlauf_c
 *   Rücklauf             -> ruecklauf_c
 *   Rückl.-Soll          -> ruecklauf_soll_c
 *   Heissgas             -> heissgas_c
 *   Außentemperatur      -> aussentemperatur_c
 *   Warmwasser-Ist       -> warmwasser_ist_c
 *   Warmwasser-Soll      -> warmwasser_soll_c
 *   Wärmequelle-Ein      -> waermequelle_ein_c
 *   Wärmequelle-Aus      -> waermequelle_aus_c
 */
import type { HeatpumpSnapshot } from "@/lib/types";
import { log } from "@/lib/logger";

// Normalised label -> snapshot key mapping.
// Keys are lowercase + stripped of punctuation so encoding variants all match.
const LABEL_MAP: Record<string, keyof Omit<HeatpumpSnapshot, "timestampUtc">> = {
  "vorlauf": "vorlauf_c",
  "rucklauf": "ruecklauf_c",
  "rucklaufsoll": "ruecklauf_soll_c",
  "rucklsoll": "ruecklauf_soll_c",
  "heissgas": "heissgas_c",
  "aussentemperatur": "aussentemperatur_c",
  "auentemperatur": "aussentemperatur_c",
  "warmwasserist": "warmwasser_ist_c",
  "warmwassersoll": "warmwasser_soll_c",
  "warmequelleein": "waermequelle_ein_c",
  "warmequelleaus": "waermequelle_aus_c",
  "wrmequelleein": "waermequelle_ein_c",
  "wrmequelleaus": "waermequelle_aus_c",
};

function normaliseLabel(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]/g, "");
}

function parseValue(raw: string): number | null {
  // Luxtronic uses comma decimals in some locales; normalise.
  const normalised = raw.replace(",", ".").trim();
  const parsed = parseFloat(normalised);
  return isNaN(parsed) ? null : parsed;
}

export function parseLuxtronicXml(xml: string): HeatpumpSnapshot {
  const snapshot: HeatpumpSnapshot = {
    timestampUtc: new Date().toISOString(),
    vorlauf_c: null,
    ruecklauf_c: null,
    ruecklauf_soll_c: null,
    heissgas_c: null,
    aussentemperatur_c: null,
    warmwasser_ist_c: null,
    warmwasser_soll_c: null,
    waermequelle_ein_c: null,
    waermequelle_aus_c: null,
  };

  // Match <item><name>…</name><value>…°C</value></item> patterns (case-insensitive tags).
  // Also handles <value>XX.X °C</value> and raw decimal variants.
  const itemRegex = /<item[^>]*>[\s\S]*?<name[^>]*>([\s\S]*?)<\/name>[\s\S]*?<value[^>]*>([\s\S]*?)<\/value>[\s\S]*?<\/item>/gi;

  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(xml)) !== null) {
    const labelRaw = match[1].replace(/<[^>]+>/g, "").trim();
    const valueRaw = match[2].replace(/<[^>]+>/g, "").replace(/°[Cc]/g, "").trim();

    const key = LABEL_MAP[normaliseLabel(labelRaw)];
    if (!key) continue;

    const value = parseValue(valueRaw);
    if (value === null) {
      log("warn", "luxtronic.parse_value_failed", { label: labelRaw, raw: valueRaw });
      continue;
    }

    snapshot[key] = value;
  }

  return snapshot;
}
