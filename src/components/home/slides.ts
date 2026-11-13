// Slide rules for the Home carousel. Pure functions, no React, no network.

export type SlideKind = "release" | "update" | "free" | "pack" | "news";
export type ActionType = "install" | "update" | "play" | "store" | "news";

export interface SlideAction {
  type: ActionType;
  /** Game id for install, update and play. Site path (starts with "/") for store and news. */
  target: string;
}

export interface Slide {
  id: string;
  kind: SlideKind;
  game: string;
  headline: string;
  line: string;
  art: string;
  action: SlideAction;
  starts: string;
  ends: string;
  priority: number;
}

export interface HomeFeed {
  version: 1;
  generated?: string;
  slides: unknown[];
}

/** What the launcher knows about one game on this machine. */
export interface PlayerGame {
  owned: boolean;
  installed: boolean;
  /** Installed build is older than the latest published one. */
  updateAvailable: boolean;
  /** The player can start it right now (installed, or playable in the browser). */
  playable: boolean;
  /** Can be installed or bought from here (listed for sale or free, and a build exists). */
  installable: boolean;
  latestVersion?: string;
  installedVersion?: string;
  displayName?: string;
}
export type PlayerState = Readonly<Record<string, PlayerGame>>;

export const MAX_SLIDES = 5;
export const ADVANCE_MS = 7000;
export const ART_HOST_ALLOWLIST: readonly string[] = ["lakesidegames.net", "assets.lakesidegames.net"];
const KINDS: readonly SlideKind[] = ["release", "update", "free", "pack", "news"];
const ACTIONS: readonly ActionType[] = ["install", "update", "play", "store", "news"];
const GAMES: readonly string[] = ["ahd", "cw", "gc", "mov", "mf", "studio"];
const SITE_PATH = /^\/[A-Za-z0-9\-._~/]*$/;

/** Lower number sorts first. Kind order is fixed; `priority` only orders within a kind. */
export const KIND_ORDER: Readonly<Record<SlideKind, number>> = {
  release: 0,
  update: 1,
  free: 2,
  pack: 3,
  news: 4,
};

function isStr(v: unknown, max: number): v is string {
  return typeof v === "string" && v.trim().length > 0 && v.length <= max;
}
function isDate(v: unknown): v is string {
  return typeof v === "string" && !Number.isNaN(Date.parse(v));
}

export function isAllowedArt(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && ART_HOST_ALLOWLIST.includes(u.hostname);
  } catch {
    return false;
  }
}

/** Returns a clean Slide, or null when any field fails validation. One bad slide never affects the others. */
export function validateSlide(raw: unknown): Slide | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  const a = s.action as Record<string, unknown> | undefined;
  if (!isStr(s.id, 80) || !KINDS.includes(s.kind as SlideKind)) return null;
  if (!GAMES.includes(s.game as string)) return null;
  if (!isStr(s.headline, 70) || !isStr(s.line, 110)) return null;
  if (!isStr(s.art, 300) || !isAllowedArt(s.art)) return null;
  if (!a || !ACTIONS.includes(a.type as ActionType) || !isStr(a.target, 200)) return null;
  const type = a.type as ActionType;
  const target = a.target as string;
  if (type === "store" || type === "news") {
    if (!SITE_PATH.test(target) || target.startsWith("//")) return null;
  } else if (!GAMES.includes(target) || target === "studio") return null;
  if (!isDate(s.starts) || !isDate(s.ends)) return null;
  if (typeof s.priority !== "number" || !Number.isFinite(s.priority)) return null;
  return {
    id: s.id,
    kind: s.kind as SlideKind,
    game: s.game as string,
    headline: s.headline,
    line: s.line,
    art: s.art,
    action: { type, target },
    starts: s.starts as string,
    ends: s.ends as string,
    priority: s.priority,
  };
}

/** Can this player do what the button says right now? */
export function isActionable(slide: Slide, player: PlayerState): boolean {
  const g = player[slide.action.target];
  switch (slide.action.type) {
    case "store":
    case "news":
      return true;
    case "update":
      return !!g && g.installed && g.updateAvailable;
    case "play":
      return !!g && g.playable;
    case "install":
      return !!g && !g.installed && g.installable;
  }
}

export function isLive(slide: Slide, now: Date): boolean {
  const t = now.getTime();
  return Date.parse(slide.starts) <= t && t < Date.parse(slide.ends);
}

/** The Update slide is built here, never from the feed: only the launcher knows what is installed. */
export function localUpdateSlides(player: PlayerState, artFor: (game: string) => string, now: Date): Slide[] {
  const out: Slide[] = [];
  for (const [game, g] of Object.entries(player)) {
    if (!g.installed || !g.updateAvailable || !g.latestVersion) continue;
    const name = g.displayName ?? game;
    out.push({
      id: `update-${game}-${g.latestVersion}`,
      kind: "update",
      game,
      headline: `${name} ${g.latestVersion} is ready`,
      line: g.installedVersion ? `You have ${g.installedVersion}.` : "A newer version is available.",
      art: artFor(game),
      action: { type: "update", target: game },
      starts: new Date(now.getTime() - 1000).toISOString(),
      ends: new Date(now.getTime() + 86_400_000).toISOString(),
      priority: 0,
    });
  }
  return out;
}

/**
 * Feed slides plus local update slides, filtered and ordered:
 * invalid dropped, expired or not started dropped, not actionable dropped,
 * duplicate ids dropped (first wins), sorted by kind order then priority then id,
 * at most MAX_SLIDES.
 */
export function buildSlides(
  feed: HomeFeed | null | undefined,
  player: PlayerState,
  now: Date,
  artFor: (game: string) => string = () => "",
): Slide[] {
  const fromFeed: Slide[] = [];
  if (feed && feed.version === 1 && Array.isArray(feed.slides)) {
    for (const raw of feed.slides) {
      const s = validateSlide(raw);
      if (s && s.kind !== "update") fromFeed.push(s);
    }
  }
  const locals = localUpdateSlides(player, artFor, now);
  const seen = new Set<string>();
  return [...fromFeed, ...locals]
    .filter((s) => isLive(s, now) && isActionable(s, player))
    .filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)))
    .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.priority - b.priority || a.id.localeCompare(b.id))
    .slice(0, MAX_SLIDES);
}

/** Auto-advance runs only when nothing says to hold still. */
export function shouldAutoAdvance(o: {
  reducedMotion: boolean;
  hovered: boolean;
  focused: boolean;
  hidden: boolean;
  count: number;
}): boolean {
  return o.count > 1 && !o.reducedMotion && !o.hovered && !o.focused && !o.hidden;
}

export function wrapIndex(i: number, count: number): number {
  return count <= 0 ? 0 : ((i % count) + count) % count;
}
