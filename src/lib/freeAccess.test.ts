import { describe, expect, it } from "vitest";
import { CATALOG } from "../catalog";
import { freeGrantedIds, freeUntilText, parseFreeAccess, withFreeAccess, FREE_ACCESS_OFF } from "./freeAccess";

const live = { on: true, endsAt: "2026-11-16T22:00:00.000Z" };
const now = new Date("2026-11-13T12:00:00Z");

describe("free access", () => {
  it("parses the live answer", () => {
    expect(parseFreeAccess({ on: true, changedAt: "x", endsAt: "2026-11-16T22:00:00.000Z" })).toEqual(live);
    expect(parseFreeAccess({ on: false, endsAt: "2026-11-16T22:00:00.000Z" })).toEqual(FREE_ACCESS_OFF);
    expect(parseFreeAccess(null)).toEqual(FREE_ACCESS_OFF);
    expect(parseFreeAccess({ on: true })).toEqual({ on: true, endsAt: null });
  });
  it("words the end time in Eastern", () => {
    expect(freeUntilText(live, now)).toBe("Free until Monday 5:00 PM Eastern");
    expect(freeUntilText({ on: true, endsAt: null }, now)).toBe("Free for now");
  });
  it("shows nothing when off or over", () => {
    expect(freeUntilText(FREE_ACCESS_OFF, now)).toBeNull();
    expect(freeUntilText(live, new Date("2026-11-17T00:00:00Z"))).toBeNull();
    expect(freeGrantedIds(FREE_ACCESS_OFF, {}, CATALOG, now).size).toBe(0);
  });
  it("opens paid games, not owned ones twice", () => {
    const paid = CATALOG.filter((product) => product.entitlementIds.length > 0);
    expect(paid.length).toBeGreaterThan(0);
    expect(freeGrantedIds(live, {}, CATALOG, now).size).toBe(paid.length);
    const first = paid[0]!;
    const owned = { [first.entitlementIds[0]!]: "owned" as const };
    expect(freeGrantedIds(live, owned, CATALOG, now).has(first.id)).toBe(false);
    const merged = withFreeAccess(live, {}, CATALOG, now);
    for (const product of paid) expect(merged[product.entitlementIds[0]!]).toBe("owned");
  });
});
