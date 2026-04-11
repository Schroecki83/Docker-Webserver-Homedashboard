import { describe, it, expect } from "vitest";
import { parseLuxtronicXml } from "@/lib/providers/luxtronic-parser";

const SAMPLE_XML = `
<values>
  <item><name>Vorlauf</name><value>20.4 °C</value></item>
  <item><name>Rücklauf</name><value>20.8 °C</value></item>
  <item><name>Rückl.-Soll</name><value>21.1 °C</value></item>
  <item><name>Heissgas</name><value>16.5 °C</value></item>
  <item><name>Außentemperatur</name><value>14.0 °C</value></item>
  <item><name>Warmwasser-Ist</name><value>47.2 °C</value></item>
  <item><name>Warmwasser-Soll</name><value>48.0 °C</value></item>
  <item><name>Wärmequelle-Ein</name><value>11.6 °C</value></item>
  <item><name>Wärmequelle-Aus</name><value>12.1 °C</value></item>
  <item><name>Betriebsstunden</name><value>12345</value></item>
</values>
`;

describe("parseLuxtronicXml", () => {
  it("maps all 9 whitelisted temperature fields", () => {
    const result = parseLuxtronicXml(SAMPLE_XML);

    expect(result.vorlauf_c).toBe(20.4);
    expect(result.ruecklauf_c).toBe(20.8);
    expect(result.ruecklauf_soll_c).toBe(21.1);
    expect(result.heissgas_c).toBe(16.5);
    expect(result.aussentemperatur_c).toBe(14.0);
    expect(result.warmwasser_ist_c).toBe(47.2);
    expect(result.warmwasser_soll_c).toBe(48.0);
    expect(result.waermequelle_ein_c).toBe(11.6);
    expect(result.waermequelle_aus_c).toBe(12.1);
  });

  it("returns null for missing fields", () => {
    const result = parseLuxtronicXml("<values></values>");
    expect(result.vorlauf_c).toBeNull();
    expect(result.warmwasser_ist_c).toBeNull();
  });

  it("ignores non-whitelisted fields (Betriebsstunden not stored)", () => {
    const result = parseLuxtronicXml(SAMPLE_XML);
    // Only 9 known keys are set; runtime fields must not bleed onto the snapshot
    const keys = Object.keys(result).filter((k) => k !== "timestampUtc");
    expect(keys).toHaveLength(9);
  });

  it("handles comma-decimal values", () => {
    const xml = `<values><item><name>Vorlauf</name><value>20,4 °C</value></item></values>`;
    const result = parseLuxtronicXml(xml);
    expect(result.vorlauf_c).toBe(20.4);
  });
});
