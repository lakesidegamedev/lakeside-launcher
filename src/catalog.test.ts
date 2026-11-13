import { describe, expect, it } from "vitest";
import {
  CATALOG,
  PRODUCTS_BY_ID,
  canLaunchDesktop,
  executableFor,
  formatPrice,
  installerSupported,
  libraryProducts,
  ownsProduct,
  type Entitlements,
} from "./catalog";

const owned: Entitlements = { "ahd-singleplayer": "owned" };

function product(id: string) {
  const found = PRODUCTS_BY_ID.get(id);
  if (!found) throw new Error(`missing ${id}`);
  return found;
}

describe("catalog integrity", () => {
  it("has unique ids", () => {
    const ids = CATALOG.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("carries no prices: money comes from the live catalog", () => {
    for (const entry of CATALOG) {
      expect(entry, entry.id).not.toHaveProperty("priceCents");
    }
  });

  it("gives every web game an https url", () => {
    for (const entry of CATALOG) {
      if (entry.delivery === "web") expect(entry.webUrl, entry.id).toMatch(/^https:\/\//);
    }
  });

  it("gives every installable native game a windows and linux executable", () => {
    for (const entry of CATALOG) {
      if (entry.delivery === "native" && !entry.registryApp) {
        expect(entry.executables?.windows, entry.id).toBeTruthy();
        expect(entry.executables?.linux, entry.id).toBeTruthy();
      }
    }
  });

  it("points every store link at lakesidegames.net", () => {
    for (const entry of CATALOG) expect(entry.storeUrl, entry.id).toMatch(/^https:\/\/lakesidegames\.net\//);
  });

  it("links the Margin of Victory browser game and desktop app both ways", () => {
    const web = product("electioneer");
    const desktop = product("margin-of-victory");
    expect(web.companion).toBe("margin-of-victory");
    expect(desktop.companionOf).toBe("electioneer");
    expect(desktop.registryApp).toBe(true);
    expect(desktop.handoffClientId).toBe("margin-of-victory");
  });
});

describe("ownership", () => {
  it("lets free games run without an entitlement", () => {
    expect(ownsProduct(product("grand-century"), {})).toBe(true);
    expect(ownsProduct(product("electioneer"), {})).toBe(true);
  });

  it("accepts the current and the legacy AHD entitlement id", () => {
    const ahd = product("ahd");
    expect(ownsProduct(ahd, {})).toBe(false);
    expect(ownsProduct(ahd, { "ahd-singleplayer": "owned" })).toBe(true);
    expect(ownsProduct(ahd, { "ahd-client": "owned" })).toBe(true);
  });

  it("does not let a refunded purchase launch", () => {
    expect(ownsProduct(product("ahd"), { "ahd-singleplayer": "refunded" })).toBe(false);
    expect(canLaunchDesktop(product("ahd"), { "ahd-singleplayer": "refunded" })).toBe(false);
  });

  it("needs an owned Corporate Warfare purchase", () => {
    const cw = product("corporate-warfare");
    expect(ownsProduct(cw, {})).toBe(false);
    expect(ownsProduct(cw, { "corporate-warfare": "owned" })).toBe(true);
    expect(cw.authenticatedDownload).toBe(true);
    expect(cw.handoffClientId).toBe("corporate-warfare-desktop");
  });
});

describe("library rows", () => {
  it("lists Margin of Victory once, with the desktop app folded into it", () => {
    const ids = libraryProducts({}).map((entry) => entry.id);
    expect(ids).toContain("electioneer");
    expect(ids).not.toContain("margin-of-victory");
  });

  it("keeps browser-playable games in the library without a purchase", () => {
    const ids = libraryProducts({}).map((entry) => entry.id);
    expect(ids).toContain("ahd");
    expect(ids).toContain("grand-century");
    expect(ids).not.toContain("corporate-warfare");
  });

  it("adds Corporate Warfare once it is owned", () => {
    expect(libraryProducts({ "corporate-warfare": "owned" }).map((entry) => entry.id)).toContain(
      "corporate-warfare",
    );
    expect(libraryProducts(owned).length).toBeGreaterThan(0);
  });
});

describe("platform helpers", () => {
  it("maps executables per platform", () => {
    const ahd = product("ahd");
    expect(executableFor(ahd, "windows")).toContain("AHDClient");
    expect(executableFor(ahd, "linux")).toContain("ahdclient");
    expect(executableFor(ahd, "browser")).toBeNull();
  });

  it("formats cents as dollars", () => {
    expect(formatPrice(1499, "usd")).toBe("$14.99");
    expect(formatPrice(99, "usd")).toBe("$0.99");
  });

  it("runs only the installers it can handle", () => {
    expect(installerSupported("inno", "windows")).toBe(true);
    expect(installerSupported("nsis", "windows")).toBe(true);
    expect(installerSupported("appimage", "linux")).toBe(true);
    expect(installerSupported("appimage", "windows")).toBe(false);
    expect(installerSupported("dmg", "macos")).toBe(true);
    expect(installerSupported("dmg", "linux")).toBe(false);
    expect(installerSupported("appimage", "macos")).toBe(false);
    expect(installerSupported("msi", "windows")).toBe(false);
  });
});
