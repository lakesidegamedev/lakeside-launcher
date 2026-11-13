import { describe, expect, it } from "vitest";
import feed from "./sample-feed.json";
import {
  bundledKey,
  buildSlides,
  isLive,
  resolveAction,
  validateSlide,
  type HomeFeed,
  type PlayerGame,
  type PlayerState,
  type SlideAction,
} from "./slides";

const game = (o: Partial<PlayerGame> = {}): PlayerGame => ({
  owned: true,
  installed: false,
  updateAvailable: false,
  playable: false,
  installable: false,
  ...o,
});
const player: PlayerState = {
  ahd: game({ installable: true }),
  cw: game({ installable: true }),
  mov: game({ playable: true }),
  gc: game({ playable: true }),
};
const NOW = new Date("2026-11-14T12:00:00Z");

function good(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "s1",
    kind: "release",
    game: "cw",
    headline: "Rivals",
    line: "A line.",
    art: "bundled",
    action: { type: "store", target: "/store/corporate-warfare" },
    starts: "2026-11-13T00:00:00Z",
    ends: "2027-01-01T00:00:00Z",
    priority: 1,
    ...over,
  };
}
const feedOf = (...slides: unknown[]): HomeFeed => ({ version: 1, slides });

describe("slide validation", () => {
  it("accepts a good slide and the poster fields", () => {
    const slide = validateSlide(
      good({
        kicker: "Out now",
        badge: "2.0",
        tile: "Rivals",
        focus: { x: 60, y: 40 },
        secondary: { type: "news", target: "/news/post/", label: "Read the post" },
        replacedBy: "ev",
        unknownField: 1,
      }),
    );
    expect(slide?.badge).toBe("2.0");
    expect(slide?.focus).toEqual({ x: 60, y: 40 });
    expect(slide?.secondary?.target).toBe("/news/post/");
    expect(slide?.replacedBy).toBe("ev");
  });

  it("rejects art off the allowlist and unknown bundled keys, accepts shipped plates", () => {
    for (const art of ["http://lakesidegames.net/a.jpg", "https://evil.example/a.jpg", "https://lakesidegames.net.evil.example/a.jpg", "https://u:p@lakesidegames.net/a.jpg", "bundled:nope", "data:image/png;base64,AA"]) {
      expect(validateSlide(good({ art }))).toBeNull();
    }
    for (const art of ["bundled", "bundled:alpha", "https://lakesidegames.net/x.jpg", "https://assets.lakesidegames.net/x.jpg"]) {
      expect(validateSlide(good({ art }))).not.toBeNull();
    }
    expect(bundledKey("bundled", "studio")).toBe("alpha");
    expect(bundledKey("bundled:cw", "studio")).toBe("cw");
    expect(bundledKey("https://lakesidegames.net/x.jpg", "cw")).toBeNull();
  });

  it("limits actions and targets, drops markup and over-long text", () => {
    expect(validateSlide(good({ action: { type: "exec", target: "/x" } }))).toBeNull();
    expect(validateSlide(good({ action: { type: "store", target: "https://evil.example/" } }))).toBeNull();
    expect(validateSlide(good({ action: { type: "store", target: "/a/../b" } }))).toBeNull();
    expect(validateSlide(good({ action: { type: "install", target: "studio" } }))).toBeNull();
    expect(validateSlide(good({ action: { type: "play", target: "gc" } }))).not.toBeNull();
    expect(validateSlide(good({ headline: "x".repeat(71) }))).toBeNull();
    expect(validateSlide(good({ line: "<b>x</b>" }))).toBeNull();
  });

  it("ignores a bad optional field instead of dropping the slide", () => {
    const slide = validateSlide(good({ focus: { x: 400, y: 1 }, secondary: { type: "store", target: "https://evil.example" }, badge: "x".repeat(40) }));
    expect(slide).not.toBeNull();
    expect(slide?.focus).toBeUndefined();
    expect(slide?.secondary).toBeUndefined();
    expect(slide?.badge).toBeUndefined();
  });
});

describe("primary action is resolved against this machine", () => {
  const install: SlideAction = { type: "install", target: "cw", label: "Install", fallback: { type: "store", target: "/store/corporate-warfare", label: "Get Corporate Warfare" } };
  it("installs when it can, plays or updates when installed", () => {
    expect(resolveAction(install, { cw: game({ installable: true }) })).toMatchObject({ type: "install", label: "Install" });
    expect(resolveAction(install, { cw: game({ installed: true, playable: true }) })).toMatchObject({ type: "play", label: "Play" });
    expect(resolveAction(install, { cw: game({ installed: true, playable: true, updateAvailable: true }) })).toMatchObject({ type: "update", label: "Update" });
  });
  it("falls back to the store page when the game is not available here", () => {
    expect(resolveAction(install, { cw: game({ owned: false }) })).toEqual({ type: "store", target: "/store/corporate-warfare", label: "Get Corporate Warfare" });
    expect(resolveAction(install, {})).toMatchObject({ type: "store" });
    expect(resolveAction({ type: "install", target: "cw" }, {})).toBeNull();
  });
  it("uses the feed's play label only for play", () => {
    expect(resolveAction({ type: "play", target: "mov", label: "Play free" }, player)).toMatchObject({ type: "play", label: "Play free" });
  });
});

describe("building the showcase", () => {
  it("drops expired and not-yet-started slides", () => {
    const f = feedOf(good({ id: "old", ends: "2026-11-14T11:59:59Z" }), good({ id: "soon", starts: "2026-11-14T12:00:01Z" }), good({ id: "now" }));
    expect(buildSlides(f, player, NOW).map((s) => s.slide.id)).toEqual(["now"]);
    expect(isLive({ starts: "2026-11-14T12:00:00Z", ends: "2026-11-14T12:00:01Z" }, NOW)).toBe(true);
  });
  it("gates free slides on the free-access switch", () => {
    const f = feedOf(good({ id: "free", kind: "free" }));
    expect(buildSlides(f, player, NOW)).toHaveLength(0);
    expect(buildSlides(f, player, NOW, { freeAccess: true })).toHaveLength(1);
  });
  it("hides a slide while the event that replaces it is live", () => {
    const f = feedOf(good({ id: "a", replacedBy: "ev" }), good({ id: "b", priority: 2 }));
    expect(buildSlides(f, player, NOW, { liveEventIds: new Set(["ev"]) }).map((s) => s.slide.id)).toEqual(["b"]);
    expect(buildSlides(f, player, NOW, { liveEventIds: new Set() }).map((s) => s.slide.id)).toEqual(["a", "b"]);
  });
  it("orders by priority, drops duplicates and feed-made update slides, caps at five", () => {
    const f = feedOf(
      good({ id: "b", priority: 2 }),
      good({ id: "a", priority: 1 }),
      good({ id: "a", priority: 0 }),
      good({ id: "u", kind: "update" }),
      ...[3, 4, 5, 6, 7].map((n) => good({ id: `n${n}`, priority: n })),
    );
    const ids = buildSlides(f, player, NOW).map((s) => s.slide.id);
    expect(ids).toEqual(["a", "b", "n3", "n4", "n5"]);
  });
  it("drops a slide with nothing to offer, one bad slide never hides the others", () => {
    const f = feedOf(good({ id: "x", action: { type: "install", target: "cw" } }), { id: "bad" }, good({ id: "ok" }));
    expect(buildSlides(f, {}, NOW).map((s) => s.slide.id)).toEqual(["ok"]);
  });
  it("keeps the second button only when it differs from the first", () => {
    const same = feedOf(good({ secondary: { type: "store", target: "/store/corporate-warfare" } }));
    expect(buildSlides(same, player, NOW)[0]?.secondary).toBeNull();
    const diff = feedOf(good({ secondary: { type: "news", target: "/news/x/", label: "Read the post" } }));
    expect(buildSlides(diff, player, NOW)[0]?.secondary?.label).toBe("Read the post");
  });
  it("returns nothing for a missing or wrong-version feed", () => {
    expect(buildSlides(null, player, NOW)).toEqual([]);
    expect(buildSlides({ version: 2 } as unknown as HomeFeed, player, NOW)).toEqual([]);
  });
});

describe("the launch feed", () => {
  it("every slide validates and has art, copy and an action", () => {
    for (const raw of (feed as unknown as HomeFeed).slides) {
      expect(validateSlide(raw), JSON.stringify(raw)).not.toBeNull();
    }
  });
  it("shows the five launch stories in the filmstrip once the free weekend is over", () => {
    const later = new Date("2026-11-17T00:00:00Z");
    const ids = buildSlides(feed as unknown as HomeFeed, player, later, { freeAccess: false }).map((s) => s.slide.id);
    expect(ids).toEqual(["ahd-120-open", "cw-2-0-rivals", "mov-2-0-elections", "gc-early-access", "studio-state-of-the-game"]);
  });
});
