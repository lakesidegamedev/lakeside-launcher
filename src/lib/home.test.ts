import { describe, expect, it } from "vitest";
import { PRODUCTS_BY_ID } from "../catalog";
import { accountSummary, continuePlaying, firstSentence, gameKeyForRow, lastPlayedText, playerState, recentlyUpdated } from "./home";
import type { LiveCatalog } from "./liveCatalog";
import type { GameRow } from "./rows";

function row(id: string, o: Partial<GameRow> = {}): GameRow {
  const product = PRODUCTS_BY_ID.get(id)!;
  return {
    product,
    desktop: product,
    title: product.title,
    blurb: "",
    state: { kind: "installed", label: "", detail: null, tone: "ok" },
    action: { kind: "launch", label: "Play" },
    actionDisabled: false,
    sizeText: "",
    lastPlayed: "-",
    installedVersion: "1.0.0",
    latestVersion: "1.0.0",
    updateAvailable: false,
    owned: true,
    hasWeb: false,
    freeText: null,
    ...o,
  };
}

describe("continue playing", () => {
  const rows = [row("ahd"), row("corporate-warfare"), row("grand-century", { desktop: null, installedVersion: null })];
  it("sorts by last played, then install time, and skips games that are not installed", () => {
    const out = continuePlaying(
      rows,
      { ahd: { version: "1", executable: "", installedAt: 5 }, "corporate-warfare": { version: "1", executable: "", installedAt: 9 } },
      { ahd: { location: "", sizeBytes: null, lastPlayedAt: 100, freeSpaceBytes: null } },
    );
    expect(out.map((entry) => entry.row.product.id)).toEqual(["ahd", "corporate-warfare"]);
  });
  it("falls back to install time when nothing was ever played", () => {
    const out = continuePlaying(
      rows,
      { ahd: { version: "1", executable: "", installedAt: 5 }, "corporate-warfare": { version: "1", executable: "", installedAt: 9 } },
      {},
    );
    expect(out.map((entry) => entry.row.product.id)).toEqual(["corporate-warfare", "ahd"]);
  });
  it("caps the list", () => {
    expect(continuePlaying(rows, {}, {}, 1)).toHaveLength(1);
  });
});

describe("recently updated", () => {
  it("takes the newest release of each game, newest first", () => {
    const out = recentlyUpdated(
      {
        ahd: [{ version: "1.19.0", publishedAt: "2026-11-10T00:00:00Z", body: "## What's changed\n\nEvery sale has a buyer. More text." }],
        gc: [{ version: "1.7.0", publishedAt: "2026-09-02T00:00:00Z", body: "The Long Century" }],
        mov: [{ version: "2.0.0", publishedAt: "2026-11-12T00:00:00Z", body: "" }],
        none: [],
      },
      { ahd: "A House Divided", gc: "Grand Century", mov: "Margin of Victory" },
    );
    expect(out.map((entry) => entry.id)).toEqual(["mov", "ahd", "gc"]);
    expect(out[1]?.summary).toBe("Every sale has a buyer.");
  });
  it("prefers a real sentence over a heading", () => {
    expect(firstSentence("### Phones and tablets\n\nThe app now fits small screens. More text.")).toBe(
      "The app now fits small screens.",
    );
  });
  it("gives nothing, so only version and date show, when the notes have no clean sentence", () => {
    expect(firstSentence("### Phones and tablets")).toBe("");
    expect(firstSentence("The Long Century")).toBe("");
    expect(firstSentence("")).toBe("");
    expect(firstSentence("## What's changed\n\n- fix(ui): see [#12](https://github.com/x/y/pull/12).")).toBe("");
    expect(firstSentence("- add `--flag` option to the cli.")).toBe("");
    expect(firstSentence("lowercase start of a sentence.")).toBe("");
    expect(firstSentence("**Full Changelog**: https://example.com/compare/a...b")).toBe("");
  });
  it("reads a bullet or bold sentence", () => {
    expect(firstSentence("- Every sale now has a buyer.\n- Other.")).toBe("Every sale now has a buyer.");
    expect(firstSentence("**Rivals** is here. More.")).toBe("Rivals is here.");
  });
  it("does not cut a long sentence short: it gives nothing instead", () => {
    expect(firstSentence(`${"Word ".repeat(40)}end.`)).toBe("");
  });
});

describe("player state for the carousel", () => {
  it("says what can be played, installed or updated", () => {
    const state = playerState(
      [
        row("ahd", { updateAvailable: true, latestVersion: "2.0.0", action: { kind: "update", label: "Update" } }),
        row("corporate-warfare", { installedVersion: null, action: { kind: "install", label: "Install" } }),
        row("grand-century", { desktop: null, installedVersion: null, hasWeb: true, action: { kind: "web", label: "Play in browser" } }),
      ],
    );
    expect(state.ahd?.updateAvailable).toBe(true);
    expect(state.ahd?.playable).toBe(true);
    expect(state.cw?.installable).toBe(true);
    expect(state.gc?.playable).toBe(true);
    expect(state.mov).toBeUndefined();
  });
});

describe("Home helpers", () => {
  it("maps library rows back to game keys", () => {
    expect(gameKeyForRow("electioneer")).toBe("mov");
    expect(gameKeyForRow("corporate-warfare")).toBe("cw");
    expect(gameKeyForRow("nope")).toBeNull();
  });
  it("words last played by day", () => {
    const now = new Date(2026, 10, 13, 15, 0);
    expect(lastPlayedText(new Date(2026, 10, 13, 1, 0).getTime(), now)).toBe("today");
    expect(lastPlayedText(new Date(2026, 10, 12, 23, 0).getTime(), now)).toBe("yesterday");
    expect(lastPlayedText(new Date(2026, 10, 10, 9, 0).getTime(), now)).toBe("3 days ago");
    expect(lastPlayedText(new Date(2026, 10, 1, 9, 0).getTime(), now)).toBe("Nov 1");
  });
  const catalog: LiveCatalog = {
    products: [{ id: "corporate-warfare", game: "cw", name: "Corporate Warfare", description: "", priceCents: 1499, currency: "usd" }],
    subscriptions: [
      { id: "supporter", name: "Supporter", priceCents: 300, interval: "month", currency: "usd", grants: ["complete"] },
      { id: "plus", name: "Supporter+", priceCents: 999, interval: "month", currency: "usd", grants: ["corporate-warfare", "complete"] },
      { id: "champ", name: "Champion", priceCents: 2000, interval: "month", currency: "usd", grants: ["corporate-warfare", "complete"] },
    ],
    subscriptionsAvailable: true,
  };
  it("names what purchases cover from the live catalog, without claiming a tier it cannot know", () => {
    const both = accountSummary("kepler", catalog, { "corporate-warfare": "owned", complete: "owned" }, "Free until Sunday, November 22 at 5:00 PM Eastern");
    expect(both.access).toBe("Supporter+ or Champion");
    expect(both.lines[0]).toBe("Corporate Warfare, Margin of Victory Complete Collection");
    expect(both.lines[1]).toBe("Free until Sunday, November 22 at 5:00 PM Eastern");
    expect(accountSummary("kepler", catalog, { complete: "owned" }, null).access).toBe("Supporter");
    const none = accountSummary("kepler", catalog, {}, null);
    expect(none.access).toBe("");
    expect(none.lines).toEqual(["No purchases yet. Free games are in the Library."]);
    expect(accountSummary("kepler", catalog, { complete: "refunded" }, null).access).toBe("");
  });
});
