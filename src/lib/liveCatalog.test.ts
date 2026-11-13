import { describe, expect, it } from "vitest";
import { PRODUCTS_BY_ID, type Product } from "../catalog";
import { CATALOG_SNAPSHOT } from "./catalogSnapshot";
import {
  addOnRows,
  addonsFor,
  grantName,
  ownedLabel,
  parseLiveCatalog,
  priceSummary,
  tierDescription,
  tierPrice,
  tierSentence,
  tiersIncluding,
} from "./liveCatalog";

function product(id: string): Product {
  const found = PRODUCTS_BY_ID.get(id);
  if (!found) throw new Error(`missing ${id}`);
  return found;
}

const live = CATALOG_SNAPSHOT;

describe("parseLiveCatalog", () => {
  it("reads products and tiers from the server shape", () => {
    const parsed = parseLiveCatalog({
      products: [
        { id: "corporate-warfare", game: "corporate-warfare", name: "Corporate Warfare", priceCents: 1499, currency: "usd", listed: true },
        { id: "hidden", game: "x", name: "Hidden", priceCents: 100, listed: false },
        { id: "broken", name: "No price" },
      ],
      subscriptions: [
        { id: "supporter", name: "Supporter", priceCents: 300, interval: "month", currency: "usd", grants: ["corporate-warfare", 7] },
      ],
      subscriptionsAvailable: true,
    });
    expect(parsed?.products.map((entry) => entry.id)).toEqual(["corporate-warfare"]);
    expect(parsed?.subscriptions[0]?.grants).toEqual(["corporate-warfare"]);
  });

  it("rejects an unknown shape", () => {
    expect(parseLiveCatalog(null)).toBeNull();
    expect(parseLiveCatalog({ nope: 1 })).toBeNull();
    expect(parseLiveCatalog("text")).toBeNull();
  });
});

describe("merging the live catalog with delivery metadata", () => {
  it("takes the Corporate Warfare price from the server, not the launcher", () => {
    const text = priceSummary(product("corporate-warfare"), live, {});
    expect(text).toBe("$14.99");
  });

  it("prices a web game with a desktop edition as free to play plus the edition", () => {
    expect(priceSummary(product("ahd"), live, {})).toBe("Free to play, single-player $14.99");
  });

  it("summarises Margin of Victory from its cheapest add-on", () => {
    expect(priceSummary(product("electioneer"), live, {})).toBe("Free base game, packs from $0.99");
  });

  it("calls games with nothing to buy free", () => {
    expect(priceSummary(product("grand-century"), live, {})).toBe("Free");
  });

  it("follows a price change in the live catalog", () => {
    const changed = {
      ...live,
      products: live.products.map((entry) =>
        entry.id === "corporate-warfare" ? { ...entry, priceCents: 1999 } : entry,
      ),
    };
    expect(priceSummary(product("corporate-warfare"), changed, {})).toBe("$19.99");
  });

  it("finds the add-ons of a game without listing the game itself", () => {
    const ids = addonsFor(product("electioneer"), live).map((entry) => entry.id);
    expect(ids).toContain("complete");
    expect(ids).toContain("uk-elections");
    expect(addonsFor(product("corporate-warfare"), live)).toEqual([]);
  });

  it("collapses equally priced country packs into one row after the Complete Collection", () => {
    const rows = addOnRows(addonsFor(product("electioneer"), live), {});
    expect(rows.map((row) => row.key)).toEqual(["complete", "packs"]);
    expect(rows[1]?.priceText).toBe("$0.99 each");
    expect(rows[1]?.owned).toBe(false);
  });

  it("marks owned add-ons from the entitlements", () => {
    const rows = addOnRows(addonsFor(product("electioneer"), live), {
      complete: "owned",
      "uk-elections": "owned",
    });
    expect(rows[0]?.owned).toBe(true);
    expect(rows[1]?.detail).toContain("You own 1");
    expect(rows[1]?.owned).toBe(false);
  });

  it("names tier grants from the live catalog and formats tier prices", () => {
    const tier = live.subscriptions[0];
    expect(tier && tierPrice(tier)).toBe("$3.00 / month");
    expect(grantName("corporate-warfare", live)).toBe("Corporate Warfare");
    expect(grantName("sandbox", live)).toBe("AHD sandbox");
  });

  it("reports ownership as owned, free or buy", () => {
    expect(ownedLabel(product("grand-century"), {})).toBe("free");
    expect(ownedLabel(product("corporate-warfare"), {})).toBe("buy");
    expect(ownedLabel(product("corporate-warfare"), { "corporate-warfare": "owned" })).toBe("owned");
  });

  it("words the bundled tiers exactly as the studio settled them", () => {
    const text = [
      ...live.subscriptions.map((tier) => tierSentence(tier, live)),
      live.tiersNote ?? "",
    ].join(" ");
    expect(text).toBe(
      "Supporter, $3 a month: support the studio, browse A House Divided ad-free, unlock supporter cosmetics and supporter chat, put your name on the supporter wall, and get the Margin of Victory Complete Collection. " +
        "Supporter+, $9.99 a month: everything in Supporter plus all paid access to every Lakeside game: Corporate Warfare, A House Divided single-player and sandbox, every Margin of Victory pack, and anything we add later. " +
        "Champion, $20 a month: the same access as Supporter+, the biggest way to back the studio, with its own place on the supporter wall. " +
        "Store subscriptions and Patreon tiers are the same tiers; join either way.",
    );
  });

  it("shows the live catalog's tiers, not a fixed list, and falls back to grants without a description", () => {
    const parsed = parseLiveCatalog({
      products: [{ id: "corporate-warfare", name: "Corporate Warfare", priceCents: 1499 }],
      subscriptions: [
        { id: "x", name: "Patron", priceCents: 500, interval: "month", grants: ["corporate-warfare"] },
        { id: "y", name: "Elder", priceCents: 1000, grants: [], description: "a custom line" },
      ],
    });
    expect(parsed?.subscriptions.map((tier) => tier.name)).toEqual(["Patron", "Elder"]);
    const [patron, elder] = parsed?.subscriptions ?? [];
    expect(patron && parsed && tierDescription(patron, parsed)).toBe("Includes Corporate Warfare");
    expect(elder && parsed && tierDescription(elder, parsed)).toBe("a custom line");
    expect(parsed && tiersIncluding(parsed, "corporate-warfare").map((tier) => tier.name)).toEqual(["Patron"]);
  });
});
