import { describe, expect, it } from "vitest";
import { compareVersions, isNewerVersion } from "./version";

describe("version comparison", () => {
  it("compares major, minor and patch numerically", () => {
    expect(compareVersions("2.11.0", "2.9.0")).toBe(1);
    expect(compareVersions("2.9.0", "2.11.0")).toBe(-1);
    expect(compareVersions("2.11.0", "2.11.0")).toBe(0);
    expect(compareVersions("3.0.0", "2.99.99")).toBe(1);
  });

  it("ignores pre-release suffixes for update decisions", () => {
    expect(compareVersions("2.11.0-beta.1", "2.11.0")).toBe(0);
    expect(isNewerVersion("2.11.0-beta.1", "2.10.0")).toBe(true);
  });

  it("never reports an update without an installed version", () => {
    expect(isNewerVersion("2.11.0", null)).toBe(false);
    expect(isNewerVersion("2.11.0", "")).toBe(false);
  });

  it("does not downgrade a newer install", () => {
    expect(isNewerVersion("2.9.0", "2.11.0")).toBe(false);
  });
});
