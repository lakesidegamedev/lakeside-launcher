// Slide rules for the Home showcase. Pure functions, no React, no network.
// A slide is a small poster: key art, a kicker, a headline, one line, one
// primary action (resolved against what this machine can do) and an optional
// quiet secondary action. Live events live in events.ts.

export type SlideKind = "release" | "update" | "free" | "pack" | "news";
export type ActionType = "install" | "update" | "play" | "store" | "news";

/** A button the feed asks for. Game actions name a game, site actions a studio page path. */
export interface Link {
  type: ActionType;
  /** Game id for install, update and play. Site path (starts with "/") for store and news. */
  target: string;
  label?: string;
}

export interface SlideAction extends Link {
  /** Runs instead when the game action cannot run here (for example the game is not owned). */
  fallback?: Link;
}

export interface Focus {
  x: number;
  y: number;
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
  kicker?: string;
  /** Version badge beside the wordmark, for example "2.0". */
  badge?: string;
  /** Short title for the filmstrip tile and the showcase tab. */
  tile?: string;
  focus?: Focus;
  secondary?: Link;
  /** A live event with this id shows the same story in its own panel; the slide waits while it is live. */
  replacedBy?: string;
}

export interface HomeFeed {
  version: 1;
  generated?: string;
  slides: unknown[];
  /** Absent in older feed files: no live events, so the filmstrip layout. */
  events?: unknown[];
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

export const BUNDLED_ART = "bundled";
export const BUNDLED_KEYS: readonly string[] = ["ahd", "cw", "gc", "mov", "alpha"];
export const MAX_SLIDES = 5;
/** One slide stays up this long; the progress bar runs for the same time. */
export const SLIDE_SECONDS = 8;
export const ART_HOST_ALLOWLIST: readonly string[] = ["lakesidegames.net", "assets.lakesidegames.net"];
const KINDS: readonly SlideKind[] = ["release", "update", "free", "pack", "news"];
const ACTIONS: readonly ActionType[] = ["install", "update", "play", "store", "news"];
export const GAMES: readonly string[] = ["ahd", "cw", "gc", "mov", "mf", "studio"];
const SITE_PATH = /^\/[A-Za-z0-9\-._~/]*$/;

export function isStr(v: unknown, max: number): v is string {
  return typeof v === "string" && v.trim().length > 0 && v.length <= max && !/[<>]/.test(v);
}
export function isDate(v: unknown): v is string {
  return typeof v === "string" && !Number.isNaN(Date.parse(v));
}

export function isAllowedArt(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && !u.username && !u.password && ART_HOST_ALLOWLIST.includes(u.hostname);
  } catch {
    return false;
  }
}

/** `bundled`, `bundled:<key>` for a shipped plate, or an allowlisted https URL. */
export function isValidArt(art: unknown): art is string {
  if (!isStr(art, 300)) return false;
  if (art === BUNDLED_ART) return true;
  if (art.startsWith("bundled:")) return BUNDLED_KEYS.includes(art.slice("bundled:".length));
  return isAllowedArt(art);
}

/** The shipped plate this art value names, or null when it is a URL. "bundled" follows the game. */
export function bundledKey(art: string, game: string): string | null {
  if (art === BUNDLED_ART) return game === "studio" ? "alpha" : BUNDLED_KEYS.includes(game) ? game : null;
  if (art.startsWith("bundled:")) return art.slice("bundled:".length);
  return null;
}

export function validateLink(raw: unknown): Link | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  if (!ACTIONS.includes(a.type as ActionType) || !isStr(a.target, 200)) return null;
  const type = a.type as ActionType;
  const target = a.target;
  if (type === "store" || type === "news") {
    if (!SITE_PATH.test(target) || target.startsWith("//") || target.includes("..")) return null;
  } else if (!GAMES.includes(target) || target === "studio") return null;
  return { type, target, ...(isStr(a.label, 28) ? { label: a.label } : {}) };
}

export function validateAction(raw: unknown): SlideAction | null {
  const link = validateLink(raw);
  if (!link) return null;
  const fallback = validateLink((raw as Record<string, unknown>).fallback);
  return fallback ? { ...link, fallback } : link;
}

export function validateFocus(raw: unknown): Focus | null {
  if (!raw || typeof raw !== "object") return null;
  const f = raw as Record<string, unknown>;
  const ok = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 100;
  return ok(f.x) && ok(f.y) ? { x: f.x, y: f.y } : null;
}

/** Returns a clean Slide, or null when any required field fails validation. One bad slide never affects the others. */
export function validateSlide(raw: unknown): Slide | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  if (!isStr(s.id, 80) || !KINDS.includes(s.kind as SlideKind)) return null;
  if (!GAMES.includes(s.game as string)) return null;
  if (!isStr(s.headline, 70) || !isStr(s.line, 130)) return null;
  if (!isValidArt(s.art)) return null;
  const action = validateAction(s.action);
  if (!action) return null;
  if (!isDate(s.starts) || !isDate(s.ends)) return null;
  if (typeof s.priority !== "number" || !Number.isFinite(s.priority)) return null;
  const secondary = validateLink(s.secondary);
  const focus = validateFocus(s.focus);
  return {
    id: s.id,
    kind: s.kind as SlideKind,
    game: s.game as string,
    headline: s.headline,
    line: s.line,
    art: s.art,
    action,
    starts: s.starts as string,
    ends: s.ends as string,
    priority: s.priority,
    ...(isStr(s.kicker, 28) ? { kicker: s.kicker } : {}),
    ...(isStr(s.badge, 10) ? { badge: s.badge } : {}),
    ...(isStr(s.tile, 44) ? { tile: s.tile } : {}),
    ...(focus ? { focus } : {}),
    ...(secondary ? { secondary } : {}),
    ...(isStr(s.replacedBy, 80) ? { replacedBy: s.replacedBy } : {}),
  };
}

export interface ResolvedAction {
  type: ActionType;
  target: string;
  label: string;
}

const SITE_LABEL: Readonly<Record<"store" | "news", string>> = { store: "Open store page", news: "Read the post" };

/** A site button, always available. */
export function siteAction(link: Link): ResolvedAction {
  const type = link.type === "news" ? "news" : "store";
  return { type, target: link.target, label: link.label ?? SITE_LABEL[type] };
}

/**
 * What the primary button does on this machine. A game action turns into
 * Update, Play or Install depending on what is installed and owned; when none
 * of those can run, the feed's fallback (usually the store page) is used.
 * Null means the slide has nothing to offer here and is dropped.
 */
export function resolveAction(action: SlideAction, player: PlayerState): ResolvedAction | null {
  if (action.type === "store" || action.type === "news") return siteAction(action);
  const g = player[action.target];
  if (g) {
    if (g.installed && g.updateAvailable) return { type: "update", target: action.target, label: "Update" };
    if (g.playable) {
      return { type: "play", target: action.target, label: action.type === "play" && action.label ? action.label : "Play" };
    }
    if (!g.installed && g.installable) {
      return { type: "install", target: action.target, label: action.type === "install" && action.label ? action.label : "Install" };
    }
  }
  return action.fallback ? siteAction(action.fallback) : null;
}

/** The quiet second button, unless it would do the same thing as the first. */
export function secondaryFor(primary: ResolvedAction, link: Link | undefined): ResolvedAction | null {
  if (!link) return null;
  const second = siteAction(link);
  return second.type === primary.type && second.target === primary.target ? null : second;
}

export function isLive(window: { starts: string; ends: string }, now: Date): boolean {
  const t = now.getTime();
  return Date.parse(window.starts) <= t && t < Date.parse(window.ends);
}

export interface ShowcaseSlide {
  slide: Slide;
  primary: ResolvedAction;
  secondary: ResolvedAction | null;
}

export interface BuildOptions {
  /** The studio free-access switch is on. Free-to-play slides show only while it is. */
  freeAccess?: boolean;
  /** Ids of events live right now; slides they replace wait. */
  liveEventIds?: ReadonlySet<string>;
}

/**
 * Feed slides, filtered and ordered: invalid dropped, outside their window
 * dropped, replaced by a live event dropped, free slides dropped unless free
 * access is on, nothing to offer dropped, duplicate ids dropped (first wins),
 * sorted by priority then id, at most MAX_SLIDES.
 */
export function buildSlides(
  feed: HomeFeed | null | undefined,
  player: PlayerState,
  now: Date,
  options: BuildOptions = {},
): ShowcaseSlide[] {
  if (!feed || feed.version !== 1 || !Array.isArray(feed.slides)) return [];
  const seen = new Set<string>();
  const out: ShowcaseSlide[] = [];
  for (const raw of feed.slides) {
    const slide = validateSlide(raw);
    // The launcher shows update prompts itself in Jump back in; a feed may not make one.
    if (!slide || slide.kind === "update") continue;
    if (slide.kind === "free" && options.freeAccess !== true) continue;
    if (!isLive({ starts: slide.starts, ends: slide.ends }, now)) continue;
    if (slide.replacedBy && options.liveEventIds?.has(slide.replacedBy)) continue;
    if (seen.has(slide.id)) continue;
    const primary = resolveAction(slide.action, player);
    if (!primary) continue;
    seen.add(slide.id);
    out.push({ slide, primary, secondary: secondaryFor(primary, slide.secondary) });
  }
  return out
    .sort((a, b) => a.slide.priority - b.slide.priority || a.slide.id.localeCompare(b.slide.id))
    .slice(0, MAX_SLIDES);
}

export function wrapIndex(i: number, count: number): number {
  return count <= 0 ? 0 : ((i % count) + count) % count;
}
