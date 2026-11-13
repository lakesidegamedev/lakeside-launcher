// Home slides: the studio feed when it can be read, else slides bundled in the
// launcher. All slide text here is true as of the build; the feed replaces it.

import type { HomeFeed } from "../components/home/slides";
import { fetchHomeFeed, fetchFreeAccess } from "./tauri";
import { FREE_ACCESS_OFF, type FreeAccess } from "./freeAccess";

const SINCE = "2026-11-13T00:00:00Z";
const UNTIL = "2027-03-01T00:00:00Z";

export const FALLBACK_FEED: HomeFeed = {
  version: 1,
  slides: [
    {
      id: "fallback-cw-2-0",
      kind: "release",
      game: "cw",
      badge: "2.0",
      kicker: "Out now",
      headline: "Rivals",
      line: "3D city maps, plant models and live goods markets. $14.99, or included with Supporter+.",
      tile: "Rivals",
      art: "bundled",
      action: {
        type: "install",
        target: "cw",
        label: "Install",
        fallback: { type: "store", target: "/store/corporate-warfare", label: "Get Corporate Warfare" },
      },
      starts: SINCE,
      ends: UNTIL,
      priority: 10,
    },
    {
      id: "fallback-mov-2-0",
      kind: "release",
      game: "mov",
      badge: "2.0",
      kicker: "Out now",
      headline: "121 elections in 14 countries",
      line: "Run a real campaign, turn by turn. The base game is free.",
      tile: "121 elections, 14 countries",
      art: "bundled",
      action: { type: "play", target: "mov", label: "Play free", fallback: { type: "store", target: "/store/margin-of-victory" } },
      starts: SINCE,
      ends: UNTIL,
      priority: 20,
    },
    {
      id: "fallback-gc-early-access",
      kind: "news",
      game: "gc",
      kicker: "Early access",
      headline: "Free in your browser",
      line: "Take a nation from 1700 to 1945. The desktop app is in progress.",
      tile: "Early access, free in your browser",
      art: "bundled",
      action: { type: "play", target: "gc", label: "Play free", fallback: { type: "store", target: "/store/grand-century" } },
      starts: SINCE,
      ends: UNTIL,
      priority: 30,
    },
    {
      id: "fallback-studio-post",
      kind: "news",
      game: "studio",
      kicker: "Studio news",
      headline: "State of the game, November 2026",
      line: "Where each of our games stands, from the studio.",
      tile: "State of the game, November 2026",
      art: "bundled",
      action: { type: "news", target: "/news/state-of-the-game-november-2026/", label: "Read the post" },
      starts: SINCE,
      ends: UNTIL,
      priority: 40,
    },
  ],
  events: [],
};

export interface HomeFeedResult {
  feed: HomeFeed;
  /** True when the studio feed was read, false for the bundled slides. */
  live: boolean;
}

/** Read the feed; any failure, or a feed with no valid slides, gives the bundled one. */
export async function loadHomeFeed(): Promise<HomeFeedResult> {
  try {
    const feed = await fetchHomeFeed();
    if (feed && feed.version === 1 && Array.isArray(feed.slides) && feed.slides.length > 0) {
      return { feed, live: true };
    }
  } catch {
    // Offline, or the file is missing: use the bundled slides.
  }
  return { feed: FALLBACK_FEED, live: false };
}

/** The studio free-access switch and its end time. Any failure means off. */
export async function loadFreeAccess(): Promise<FreeAccess> {
  try {
    return await fetchFreeAccess();
  } catch {
    return FREE_ACCESS_OFF;
  }
}
