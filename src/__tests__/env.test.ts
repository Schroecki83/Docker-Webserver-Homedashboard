import { beforeEach, describe, expect, it } from "vitest";

describe("env", () => {
  beforeEach(() => {
    process.env.FRONIUS_BASE_URL = "http://192.168.70.79";
    process.env.FRONIUS_USERNAME = "";
    process.env.FRONIUS_PASSWORD = "";
    process.env.LUXTRONIC_HOST = "192.168.70.47";
    process.env.LUXTRONIC_PORT = "8214";
    process.env.LUXTRONIC_PASSWORD = "9999";
    process.env.SHELLY_HT_DEVICES = "192.168.70.34,192.168.70.40";
    process.env.SHELLY_GEN1_DEVICES = "192.168.70.97";
  });

  it("loads required values", async () => {
    const module = await import("@/lib/env");
    const value = module.env();

    expect(value.LUXTRONIC_PASSWORD).toBe("9999");
    expect(value.SHELLY_HT_DEVICES).toEqual(["192.168.70.34", "192.168.70.40"]);
  });
});