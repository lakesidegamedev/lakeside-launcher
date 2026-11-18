import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import "./home.css";
import type { FreeAccess } from "../../lib/freeAccess";
import { chooseShowcase, type LiveEvent } from "./events";
import { GAME_NAMES, artUrl, fallbackArt } from "./keyart";
import { keyIntent } from "./pause";
import {
  resolveAction,
  secondaryFor,
  siteAction,
  wrapIndex,
  type ActionType,
  type HomeFeed,
  type PlayerState,
} from "./slides";

export interface HomeShowcaseProps {
  feed: HomeFeed | null;
  player: PlayerState;
  freeAccess: FreeAccess;
  onAction: (action: { type: ActionType; target: string }) => void;
  /** Clock for tests and previews. Defaults to the real time. */
  now?: Date;
}

const KIND_LABEL = {
  release: "New release",
  update: "Update ready",
  free: "Free to play",
  pack: "Country pack",
  news: "Studio news",
} as const;

/** The current time, refreshed every minute and the moment the window gets focus back. */
function useNow(override?: Date): Date {
  const [now, setNow] = useState(() => override ?? new Date());
  useEffect(() => {
    if (override) return;
    const tick = () => setNow(new Date());
    const timer = setInterval(tick, 60_000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [override]);
  return override ?? now;
}

function EventPanel({
  event,
  player,
  onAction,
}: {
  event: LiveEvent;
  player: PlayerState;
  onAction: HomeShowcaseProps["onAction"];
}): JSX.Element {
  const primary = event.action ? resolveAction(event.action, player) : null;
  const secondary = primary ? secondaryFor(primary, event.secondary) : event.secondary ? siteAction(event.secondary) : null;
  return (
    <article className="event-item">
      <div>
        <span className="event-label">{event.kicker ?? (event.kind === "free" ? "Free access" : event.kind === "countdown" ? "Coming soon" : "Offer")}</span>
        <h3>{event.headline}</h3>
        <p>{event.line}</p>
      </div>
      <div className="event-actions">
        {primary ? <button type="button" className="btn p" onClick={() => onAction(primary)}>{primary.label}</button> : null}
        {secondary ? <button type="button" className="btn" onClick={() => onAction(secondary)}>{secondary.label}</button> : null}
      </div>
    </article>
  );
}

export function HomeShowcase({ feed, player, freeAccess, onAction, now: nowOverride }: HomeShowcaseProps): JSX.Element | null {
  const now = useNow(nowOverride);
  const { events, slides } = useMemo(
    () => chooseShowcase(feed, player, now, freeAccess),
    [feed, player, freeAccess, now],
  );
  // A remote picture that fails to load falls back to the shipped plate for the game.
  const [brokenArt, setBrokenArt] = useState<ReadonlySet<string>>(new Set());
  const [index, setIndex] = useState(0);
  const count = slides.length;
  const active = wrapIndex(index, count);

  // Keep the position when the slide list changes under the player (an event ending, a refresh).
  useEffect(() => {
    if (index >= count && count > 0) setIndex(0);
  }, [count, index]);

  if (count === 0 && events.length === 0) return null;

  const go = (n: number) => setIndex(wrapIndex(n, count));
  const featured = slides[active];
  const slide = featured?.slide;
  const secondary = featured?.secondary;
  const remoteArt = slide ? artUrl(slide.art, slide.game) : undefined;

  const onKey = (event: KeyboardEvent<HTMLElement>) => {
    const intent = keyIntent(event.key, active, count, event.target === event.currentTarget);
    if (!intent) return;
    event.preventDefault();
    if (intent.type === "go") go(intent.index);
    else if (featured) onAction(featured.primary);
  };

  return (
    <section className="show" aria-label="Featured stories" onKeyDown={onKey} tabIndex={0}>
      {featured && slide && remoteArt ? (
        <article className="featured-story">
          <div className="feature-copy">
            <span className="feature-series">{GAME_NAMES[slide.game] ?? slide.game}{slide.badge ? ` / ${slide.badge}` : ""}</span>
            <h2 className="hl">{slide.headline}</h2>
            <p>{slide.line}</p>
            <div className="acts">
              <button type="button" className="btn p" onClick={() => onAction(featured.primary)}>{featured.primary.label}</button>
              {secondary ? (
                <button type="button" className="btn" onClick={() => onAction(secondary)}>{secondary.label}</button>
              ) : null}
            </div>
          </div>
          <img
            className="feature-art"
            src={brokenArt.has(slide.id) ? fallbackArt(slide.game) : remoteArt}
            alt=""
            style={{ objectPosition: `${slide.focus?.x ?? 62}% ${slide.focus?.y ?? 50}%` }}
            onError={() => {
              if (!brokenArt.has(slide.id)) setBrokenArt((previous) => new Set(previous).add(slide.id));
            }}
          />
        </article>
      ) : null}
      {count > 1 ? (
        <nav className="feature-index" aria-label="Stories">
          {slides.map(({ slide: story }, i) => (
            <button
              key={story.id}
              type="button"
              className="feature-link"
              aria-label={`Show: ${story.tile ?? story.headline}`}
              aria-current={i === active}
              onClick={() => go(i)}
            >
              <small>{story.kicker ?? KIND_LABEL[story.kind]}</small>
              <span>{story.tile ?? story.headline}</span>
            </button>
          ))}
        </nav>
      ) : null}
      {events.length > 0 ? (
        <section className="feature-events" aria-label="Events">
          {events.map((event) => <EventPanel key={event.id} event={event} player={player} onAction={onAction} />)}
        </section>
      ) : null}
      <span className="sr-only" aria-live="polite">{slide?.headline}</span>
    </section>
  );
}
