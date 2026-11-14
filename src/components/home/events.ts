// Live events and the choice between the two Home layouts. Pure, no React.
//
// Layout C (split) shows while at least one live event is active: the showcase
// plus one or two live panels. With none, layout B (filmstrip) shows. The
// choice is recomputed from the clock, so an event ending or starting changes
// the layout without a restart.

import { freeAccessActive, freeUntilText, type FreeAccess } from "../../lib/freeAccess";
import {
  GAMES,
  buildSlides,
  isDate,
  isStr,
  isValidArt,
  validateAction,
  validateFocus,
  validateLink,
  type Focus,
  type HomeFeed,
  type PlayerState,
  type ShowcaseSlide,
  type SlideAction,
  type Link,
} from "./slides";

export type EventKind = "countdown" | "offer" | "free";
const EVENT_KINDS: readonly EventKind[] = ["countdown", "offer", "free"];
export const MAX_LIVE_EVENTS = 2;

export interface HomeEvent {
  id: string;
  kind: EventKind;
  headline: string;
  line: string;
  startsAt: string;
  endsAt: string;
  /** Countdown target time. */
  target?: string;
  kicker?: string;
  action?: SlideAction;
  secondary?: Link;
  art: string;
  /** Game key that sets the accent colour; "studio" is the brass studio accent. */
  accent: string;
  focus?: Focus;
}

/** An event that is live right now, with the end time that applies. */
export interface LiveEvent extends HomeEvent {
  /** Free events take this from the live free-access answer, not from the feed. */
  effectiveEndsAt: string;
}

export function validateEvent(raw: unknown): HomeEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  if (!isStr(e.id, 80) || !EVENT_KINDS.includes(e.kind as EventKind)) return null;
  if (!isStr(e.accent, 16) || !GAMES.includes(e.accent)) return null;
  if (!isStr(e.headline, 70) || !isStr(e.line, 130) || !isValidArt(e.art)) return null;
  if (!isDate(e.startsAt) || !isDate(e.endsAt)) return null;
  const target = isDate(e.target) ? e.target : undefined;
  // A target that is present but not a date makes the event unusable.
  if (e.target !== undefined && !target) return null;
  if (e.kind === "countdown" && !target) return null;
  const action = validateAction(e.action);
  const secondary = validateLink(e.secondary);
  const focus = validateFocus(e.focus);
  return {
    id: e.id,
    kind: e.kind as EventKind,
    headline: e.headline,
    line: e.line,
    startsAt: e.startsAt as string,
    endsAt: e.endsAt as string,
    art: e.art,
    accent: e.accent,
    ...(target ? { target } : {}),
    ...(isStr(e.kicker, 28) ? { kicker: e.kicker } : {}),
    ...(action ? { action } : {}),
    ...(secondary ? { secondary } : {}),
    ...(focus ? { focus } : {}),
  };
}

/**
 * Events live at `now`. Events outside their window are ignored even when the
 * feed still lists them. A free event also needs the live free-access answer to
 * be on, and its end time comes from that answer, so the launcher never
 * advertises free access the store is not giving.
 */
export function liveEvents(feed: HomeFeed | null | undefined, now: Date, freeAccess: FreeAccess): LiveEvent[] {
  if (!feed || feed.version !== 1 || !Array.isArray(feed.events)) return [];
  const t = now.getTime();
  const seen = new Set<string>();
  const out: LiveEvent[] = [];
  for (const raw of feed.events) {
    const event = validateEvent(raw);
    if (!event || seen.has(event.id)) continue;
    if (Date.parse(event.startsAt) > t) continue;
    let end = event.endsAt;
    if (event.kind === "free") {
      if (!freeAccess.on) continue;
      end = freeAccess.endsAt ?? event.endsAt;
    }
    if (t >= Date.parse(end)) continue;
    seen.add(event.id);
    out.push({ ...event, effectiveEndsAt: end });
  }
  return out
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.id.localeCompare(b.id))
    .slice(0, MAX_LIVE_EVENTS);
}

export type HomeLayout = "split" | "film";

export interface HomeShowcase {
  /** "split" is layout C (live events), "film" is layout B. */
  layout: HomeLayout;
  events: LiveEvent[];
  slides: ShowcaseSlide[];
}

export function chooseShowcase(
  feed: HomeFeed | null | undefined,
  player: PlayerState,
  now: Date,
  freeAccess: FreeAccess,
): HomeShowcase {
  const events = liveEvents(feed, now, freeAccess);
  const slides = buildSlides(feed, player, now, {
    freeAccess: freeAccessActive(freeAccess, now),
    liveEventIds: new Set(events.map((event) => event.id)),
  });
  // The feed's free copy is written ahead of time and may name the wrong day. The end
  // text always comes from the live switch.
  const endText = freeUntilText(freeAccess, now);
  const liveLine = (line: string): string => (endText ? `${endText}.` : line);
  return {
    layout: events.length > 0 ? "split" : "film",
    events: events.map((event) => (event.kind === "free" ? { ...event, line: liveLine(event.line) } : event)),
    slides: slides.map((entry) =>
      entry.slide.kind === "free"
        ? { ...entry, slide: { ...entry.slide, line: liveLine(entry.slide.line), ...(entry.slide.tile ? { tile: "Everything is free" } : {}) } }
        : entry,
    ),
  };
}

/** Time left until `target`, split for the countdown boxes. Never negative. */
export function remaining(target: string, now: Date): { days: number; hours: number; minutes: number; seconds: number } {
  const total = Math.max(0, Math.floor((Date.parse(target) - now.getTime()) / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

/** Share of an event's run still left, 0 to 1, for the thin "time left" bar. */
export function shareLeft(event: Pick<LiveEvent, "startsAt" | "effectiveEndsAt">, now: Date): number {
  const start = Date.parse(event.startsAt);
  const end = Date.parse(event.effectiveEndsAt);
  if (!(end > start)) return 0;
  return Math.min(1, Math.max(0, (end - now.getTime()) / (end - start)));
}
