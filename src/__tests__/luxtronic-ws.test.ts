import { describe, expect, it } from "vitest";
import { extractTemperaturesNodeId } from "@/lib/providers/luxtronic-ws";

describe("extractTemperaturesNodeId", () => {
  it("extracts Temperaturen item id from navigation xml", () => {
    const xml = "<?xml version='1.0'?><Navigation><item id='0x0x111'><name>Informationen</name></item><item id='0x0x222'><name>Temperaturen</name></item></Navigation>";
    expect(extractTemperaturesNodeId(xml)).toBe("0x0x222");
  });

  it("returns null when Temperaturen item is missing", () => {
    const xml = "<?xml version='1.0'?><Navigation><item id='0x0x111'><name>Informationen</name></item></Navigation>";
    expect(extractTemperaturesNodeId(xml)).toBeNull();
  });
});
