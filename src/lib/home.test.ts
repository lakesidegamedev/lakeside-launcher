import { describe, expect, it } from "vitest";
import { PRODUCTS_BY_ID } from "../catalog";
import { continuePlaying, firstSentence, playerState, recentlyUpdated } from "./home";
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
  it("shortens one long sentence", () => {
    expect(firstSentence("x".repeat(300)).length).toBeLessThanOrEqual(110);
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
