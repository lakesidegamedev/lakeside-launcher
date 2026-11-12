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
    expect(ids).toContain("grand-century");
  });

  it("lists unowned priced products in the store", () => {
    const ids = storeProducts({}).map((product) => product.id);
    expect(ids).toContain("ahd");
    expect(ids).toContain("us-historical");
    expect(ids).not.toContain("electioneer");
  });

  it("lists the free browser game in the library, not the store", () => {
    expect(libraryProducts(owned).map((product) => product.id)).toContain("grand-century");
    expect(storeProducts(owned).map((product) => product.id)).not.toContain("grand-century");
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

describe("native delivery metadata", () => {
  it("keeps AHD on the public manifest URL with no handoff", () => {
    const ahd = CATALOG.find((product) => product.id === "ahd");
    expect(ahd?.authenticatedDownload).toBeUndefined();
    expect(ahd?.handoffClientId).toBeUndefined();
  });

  it("opts Corporate Warfare into paid downloads and the handoff", () => {
    const cw = CATALOG.find((product) => product.id === "corporate-warfare");
    expect(cw?.productId).toBe("corporate-warfare");
    expect(cw?.authenticatedDownload).toBe(true);
    expect(cw?.handoffClientId).toBe("corporate-warfare-desktop");
    expect(cw?.executables?.linux).toMatch(/\.AppImage$/);
  });

  it("supports the right installer kinds per platform", async () => {
    const { installerSupported } = await import("./catalog");
    expect(installerSupported("nsis", "windows")).toBe(true);
    expect(installerSupported("inno", "windows")).toBe(true);
    expect(installerSupported("appimage", "linux")).toBe(true);
    expect(installerSupported("appimage", "windows")).toBe(false);
    expect(installerSupported("dmg", "macos")).toBe(false);
  });
});
