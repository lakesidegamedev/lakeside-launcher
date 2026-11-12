import { describe, expect, it } from "vitest";
import {
  CATALOG,
  canLaunchDesktop,
  executableFor,
  formatPrice,
  libraryProducts,
  ownsProduct,
  storeProducts,
  type Entitlements,
} from "./catalog";

const owned: Entitlements = { "ahd-client": "owned", "us-historical": "owned" };

describe("catalog integrity", () => {
  it("has unique ids", () => {
    const ids = CATALOG.map((product) => product.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps commercial product ids unique", () => {
    const ids = CATALOG.map((product) => product.productId).filter(
      (id): id is string => id !== null && !id.startsWith("ahd-"),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every available web product an https url", () => {
    for (const product of CATALOG) {
      if (product.delivery === "web" && product.status === "available") {
        expect(product.webUrl, product.id).toMatch(/^https:\/\//);
      }
    }
  });

  it("gives every native product a windows and linux executable", () => {
    for (const product of CATALOG) {
      if (product.delivery === "native") {
        expect(product.executables?.windows, product.id).toBeTruthy();
        expect(product.executables?.linux, product.id).toBeTruthy();
      }
    }
  });
});

describe("ownership", () => {
  it("treats free products as owned", () => {
    const free = CATALOG.find((product) => product.id === "electioneer");
    expect(free).toBeDefined();
    expect(ownsProduct(free!, {})).toBe(true);
  });

  it("requires an entitlement for paid native products", () => {
    const ahd = CATALOG.find((product) => product.id === "ahd")!;
    expect(ownsProduct(ahd, {})).toBe(false);
    expect(canLaunchDesktop(ahd, {})).toBe(false);
    expect(canLaunchDesktop(ahd, owned)).toBe(true);
  });

  it("does not let a refunded purchase launch", () => {
    const ahd = CATALOG.find((product) => product.id === "ahd")!;
    expect(ownsProduct(ahd, { "ahd-client": "refunded" })).toBe(false);
  });

  it("lists owned and free tiles in the library", () => {
    const ids = libraryProducts(owned).map((product) => product.id);
    expect(ids).toContain("ahd");
    expect(ids).toContain("electioneer");
    expect(ids).not.toContain("grand-century");
  });

  it("lists unowned priced products in the store", () => {
    const ids = storeProducts({}).map((product) => product.id);
    expect(ids).toContain("ahd");
    expect(ids).toContain("us-historical");
    expect(ids).not.toContain("electioneer");
  });
});

describe("platform helpers", () => {
  it("maps executables per platform", () => {
    const ahd = CATALOG.find((product) => product.id === "ahd")!;
    expect(executableFor(ahd, "windows")).toContain("AHDClient");
    expect(executableFor(ahd, "linux")).toContain("ahdclient");
    expect(executableFor(ahd, "browser")).toBeNull();
  });

  it("formats cents as dollars", () => {
    expect(formatPrice(2000, "usd")).toBe("$20.00");
    expect(formatPrice(499, "usd")).toBe("$4.99");
  });
});
