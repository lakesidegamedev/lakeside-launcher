// Home slides: the studio feed when it can be read, else slides bundled in the
// launcher. All slide text here is true as of the build; the feed replaces it.

import type { HomeFeed } from "../components/home/slides";
import { fetchHomeFeed, fetchFreeAccess } from "./tauri";
import { FREE_ACCESS_OFF, type FreeAccess } from "./freeAccess";

export const FALLBACK_FEED: HomeFeed = {
  version: 1,
  slides: [
    {
      id: "fallback-cw-2-0",
      kind: "release",
      game: "cw",
      headline: "Corporate Warfare 2.0 is out",
      line: "$14.99, or included with Supporter+.",
      art: "bundled",
      action: { type: "store", target: "/store/corporate-warfare" },
      starts: "2026-11-13T00:00:00Z",
      ends: "2027-03-01T00:00:00Z",
      priority: 10,
    },
    {
      id: "fallback-mov-2-0",
      kind: "release",
      game: "mov",
      headline: "Margin of Victory 2.0",
      line: "121 elections in 14 countries. Play free in your browser.",
      art: "bundled",
      action: { type: "play", target: "mov" },
      starts: "2026-11-13T00:00:00Z",
      ends: "2027-03-01T00:00:00Z",
      priority: 20,
    },
    {
      id: "fallback-gc-early-access",
      kind: "news",
      game: "gc",
      headline: "Grand Century is in early access",
      line: "Play it in your browser now. A desktop version is in progress.",
      art: "bundled",
      action: { type: "play", target: "gc" },
      starts: "2026-11-13T00:00:00Z",
      ends: "2027-03-01T00:00:00Z",
      priority: 50,
    },
  ],
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
