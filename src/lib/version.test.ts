import { describe, expect, it } from "vitest";
import { compareVersions, isNewerVersion } from "./version";

describe("version comparison", () => {
  it("compares major, minor and patch numerically", () => {
    expect(compareVersions("2.11.0", "2.9.0")).toBe(1);
    expect(compareVersions("2.9.0", "2.11.0")).toBe(-1);
    expect(compareVersions("2.11.0", "2.11.0")).toBe(0);
    expect(compareVersions("3.0.0", "2.99.99")).toBe(1);
  });

  it("orders pre-releases below their release, and by their parts", () => {
    // a finished release is an update over any preview of it
    expect(isNewerVersion("1.0.0", "1.0.0-preview.5")).toBe(true);
    expect(isNewerVersion("1.0.0-preview.7", "1.0.0-preview.5")).toBe(true);
    expect(isNewerVersion("1.0.0-preview.10", "1.0.0-preview.9")).toBe(true);
    // a beta is never offered over the finished release
    expect(compareVersions("2.11.0-beta.1", "2.11.0")).toBe(-1);
    expect(isNewerVersion("2.11.0-beta.1", "2.11.0")).toBe(false);
    expect(isNewerVersion("2.11.0-beta.1", "2.10.0")).toBe(true);
    expect(compareVersions("v1.2.0", "1.2.0")).toBe(0);
    expect(compareVersions("1.2.0+build.5", "1.2.0")).toBe(0);
    expect(compareVersions("1.0.0-alpha", "1.0.0-alpha.1")).toBe(-1);
    expect(compareVersions("1.0.0-alpha.1", "1.0.0-beta")).toBe(-1);
  });

  it("never reports an update without an installed version", () => {
    expect(isNewerVersion("2.11.0", null)).toBe(false);
    expect(isNewerVersion("2.11.0", "")).toBe(false);
  });

  it("does not downgrade a newer install", () => {
    expect(isNewerVersion("2.9.0", "2.11.0")).toBe(false);
  });
});
