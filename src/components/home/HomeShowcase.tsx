/**
 * The Home showcase. One component, two layouts chosen from the feed:
 *   split (layout C): a dominant showcase with up to two live-event panels beside it.
 *   film  (layout B): a full-bleed showcase with a filmstrip of labelled tiles under it.
 * The choice is recomputed from the clock, on window focus and when the feed or
 * the free-access answer changes, so a live event ending or starting switches
 * the layout without a restart.
 *
 * Motion: slow scale on the active art, text rising with a fade, a thin
 * progress bar that also drives the advance. Hover, focus and a hidden window
 * hold everything still. Reduced motion turns all of it off, including autoplay;
 * arrow keys and the tabs still work. Enter on the showcase runs the primary action.
 */
import { useEffect, useMemo, useReducer, useState, type AnimationEvent, type CSSProperties, type KeyboardEvent } from "react";
import "./home.css";
import type { FreeAccess } from "../../lib/freeAccess";
import { chooseShowcase, remaining, shareLeft, type LiveEvent } from "./events";
import { GAME_NAMES, artUrl, fallbackArt } from "./keyart";
import { blurLeaves, initialPause, isHeld, keyIntent, pauseReducer, shouldAutoAdvance } from "./pause";
import {
  resolveAction,
  secondaryFor,
  siteAction,
  wrapIndex,
  type ActionType,
  type HomeFeed,
  type PlayerState,
  type ResolvedAction,
  type ShowcaseSlide,
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

const FREE_GAMES = ["ahd", "mov", "cw", "gc"] as const;

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  return reduced;
}

/** The current time, refreshed every second and the moment the window gets focus back. */
function useNow(override?: Date): Date {
  const [now, setNow] = useState(() => override ?? new Date());
  useEffect(() => {
    if (override) return;
    const tick = () => setNow(new Date());
    const timer = setInterval(tick, 1000);
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

/** True when focus came from the keyboard (or the browser cannot say). */
function keyboardFocus(el: EventTarget): boolean {
  try {
    return (el as Element).matches(":focus-visible");
  } catch {
    return true;
  }
}

const accentClass = (game: string): string => (game === "studio" ? "lkc" : `${game}c`);
const pos = (focus: { x: number; y: number } | undefined): CSSProperties =>
  ({ "--pos": `${focus?.x ?? 62}% ${focus?.y ?? 50}%` }) as CSSProperties;
const pad = (n: number): string => String(n).padStart(2, "0");

function Wordmark({ game, badge }: { game: string; badge?: string }): JSX.Element {
  return (
    <div className={`wm ${game === "studio" ? "lk" : game}`}>
      {game === "studio" ? <span className="wm-mark" aria-hidden="true" /> : null}
      {GAME_NAMES[game] ?? game}
      {badge ? <span className="v">{badge}</span> : null}
    </div>
  );
}

function Countdown({ target, now }: { target: string; now: Date }): JSX.Element {
  const t = remaining(target, now);
  const cells: [string, string][] = [
    [String(t.days), "days"],
    [pad(t.hours), "hours"],
    [pad(t.minutes), "min"],
    [pad(t.seconds), "sec"],
  ];
  return (
    <div className="cd" role="timer" aria-label={`${t.days} days, ${t.hours} hours, ${t.minutes} minutes left`}>
      {cells.map(([value, unit]) => (
        <div key={unit}>
          <b>{value}</b>
          <span>{unit}</span>
        </div>
      ))}
    </div>
  );
}

function EventPanel({
  event,
  now,
  player,
  onAction,
}: {
  event: LiveEvent;
  now: Date;
  player: PlayerState;
  onAction: HomeShowcaseProps["onAction"];
}): JSX.Element {
  const primary = event.action ? resolveAction(event.action, player) : null;
  const secondary = primary ? secondaryFor(primary, event.secondary) : event.secondary ? siteAction(event.secondary) : null;
  const game = event.accent;
  return (
    <aside className={`lp ${accentClass(game)}`} aria-label={event.headline}>
      <div className="bg" style={{ backgroundImage: `url(${JSON.stringify(artUrl(event.art, game))})`, backgroundPosition: `${event.focus?.x ?? 60}% ${event.focus?.y ?? 50}%` }} />
      <div className="sc" />
      <span className="kick">
        <span className="dot" />
        {event.kicker ?? (event.kind === "free" ? "Free this weekend" : event.kind === "countdown" ? "Coming soon" : "Offer")}
      </span>
      <h3>{event.headline}</h3>
      {event.kind === "countdown" && event.target ? <Countdown target={event.target} now={now} /> : null}
      <p>{event.line}</p>
      {event.kind === "free" ? (
        <div className="gm">
          {FREE_GAMES.map((key) => (
            <span key={key} className={accentClass(key)}>
              <i className="dot" />
              {GAME_NAMES[key]}
            </span>
          ))}
        </div>
      ) : null}
      <div className="row">
        {primary ? (
          <button type="button" className="btn p sm" onClick={() => onAction(primary)}>
            {primary.label}
          </button>
        ) : null}
        {secondary ? (
          <button type="button" className="btn quiet sm" onClick={() => onAction(secondary)}>
            {secondary.label}
          </button>
        ) : null}
        {event.kind === "free" ? (
          <span className="left" aria-hidden="true">
            <i style={{ width: `${Math.round(shareLeft(event, now) * 100)}%` }} />
          </span>
        ) : null}
      </div>
    </aside>
  );
}

export function HomeShowcase({ feed, player, freeAccess, onAction, now: nowOverride }: HomeShowcaseProps): JSX.Element | null {
  const now = useNow(nowOverride);
  const { layout, events, slides: built } = useMemo(
    () => chooseShowcase(feed, player, now, freeAccess),
    // The clock only matters at whole seconds; the layout is recomputed from it each tick.
    [feed, player, freeAccess, now],
  );
  // A remote picture that fails to load falls back to the shipped plate for the game.
  const [brokenArt, setBrokenArt] = useState<ReadonlySet<string>>(new Set());
  const slides: ShowcaseSlide[] = built;
  const [index, setIndex] = useState(0);
  const [pause, dispatch] = useReducer(
    pauseReducer,
    typeof document !== "undefined" && document.hidden,
    initialPause,
  );
  const reducedMotion = usePrefersReducedMotion();
  const count = slides.length;
  const active = wrapIndex(index, count);

  useEffect(() => {
    const change = () => dispatch({ type: "visibility", hidden: document.hidden });
    document.addEventListener("visibilitychange", change);
    return () => document.removeEventListener("visibilitychange", change);
  }, []);

  // Keep the position when the slide list changes under the player (an event ending, a refresh).
  useEffect(() => {
    if (index >= count && count > 0) setIndex(0);
  }, [count, index]);

  if (count === 0 && events.length === 0) return null;

  const auto = shouldAutoAdvance({ reducedMotion, count, ...pause });
  const showProgress = count > 1 && !reducedMotion;
  const go = (n: number) => setIndex(wrapIndex(n, count));
  const split = layout === "split";

  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    const intent = keyIntent(e.key, active, count, e.target === e.currentTarget);
    if (!intent) return;
    e.preventDefault();
    if (intent.type === "go") go(intent.index);
    else if (slides[active]) onAction(slides[active].primary);
  };
  const onFillEnd = (e: AnimationEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).dataset.fill) go(active + 1);
  };
  const progress = (i: number) =>
    showProgress && i === active ? (
      <span className="pg" aria-hidden="true">
        <i data-fill="1" key={`${slides[i]?.slide.id}-${active}`} onAnimationEnd={onFillEnd} />
      </span>
    ) : null;
  const tabLabel = (s: ShowcaseSlide) => s.slide.tile ?? s.slide.headline;
  // Showcase tabs are short: the game and version, or the kicker for studio stories.
  const segLabel = (s: ShowcaseSlide) =>
    s.slide.game === "studio"
      ? (s.slide.kicker ?? tabLabel(s))
      : `${GAME_NAMES[s.slide.game] ?? s.slide.game}${s.slide.badge ? ` ${s.slide.badge}` : ""}`;

  const classes = ["show", split ? `show-split${events.length === 1 ? " one" : ""}` : "show-film"];
  if (isHeld(pause)) classes.push("held");
  if (reducedMotion) classes.push("calm");

  return (
    <section
      className={classes.join(" ")}
      data-layout={layout}
      aria-roledescription="carousel"
      aria-label="What is new"
      tabIndex={0}
      onMouseEnter={() => dispatch({ type: "mouseenter" })}
      onMouseLeave={() => dispatch({ type: "mouseleave" })}
      onFocus={(e) => {
        // Keyboard focus holds the show; a mouse click on a tab does not leave it frozen.
        if (keyboardFocus(e.target)) dispatch({ type: "focus" });
      }}
      onBlur={(e) => dispatch({ type: "blur", stillInside: !blurLeaves(e.currentTarget, e.relatedTarget) })}
      onKeyDown={onKey}
    >
      <div className={split ? "dom" : "stage"}>
        {slides.map((s, i) => {
          const { slide } = s;
          const remote = artUrl(slide.art, slide.game);
          const url = brokenArt.has(slide.id) ? fallbackArt(slide.game) : remote;
          const on = i === active;
          return (
            <article
              key={slide.id}
              className={`slide ${accentClass(slide.game)}${on ? " on" : ""}`}
              style={pos(slide.focus)}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${count}`}
              aria-hidden={!on}
            >
              <div className="art" style={{ backgroundImage: `url(${JSON.stringify(url)})` }} />
              {/^https:/.test(remote) && !brokenArt.has(slide.id) ? (
                <img
                  className="probe"
                  src={remote}
                  alt=""
                  onError={() => setBrokenArt((previous) => new Set(previous).add(slide.id))}
                />
              ) : null}
              <div className="scrim" />
              <div className="txt">
                <div className="toprow">
                  <Wordmark game={slide.game} badge={slide.badge} />
                  <span className="kick">
                    <span className="dot" />
                    {slide.kicker ?? KIND_LABEL[slide.kind]}
                  </span>
                </div>
                <h2 className="hl">{slide.headline}</h2>
                <p className="lead">{slide.line}</p>
                <div className="acts">
                  <button type="button" className="btn p big" tabIndex={on ? 0 : -1} onClick={() => onAction(s.primary)}>
                    {s.primary.label}
                  </button>
                  {s.secondary ? (
                    <button type="button" className="btn quiet big" tabIndex={on ? 0 : -1} onClick={() => onAction(s.secondary as ResolvedAction)}>
                      {s.secondary.label}
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
        {split && count > 0 ? (
          <nav className="segs" aria-label="Slides" style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}>
            {slides.map((s, i) => (
              <button
                key={s.slide.id}
                type="button"
                className={`seg ${accentClass(s.slide.game)}${i === active ? " on" : ""}`}
                aria-label={`Show: ${tabLabel(s)}`}
                aria-current={i === active}
                onClick={() => go(i)}
              >
                <span className="dot" />
                {segLabel(s)}
                {progress(i)}
              </button>
            ))}
          </nav>
        ) : null}
      </div>
      {split ? (
        <div className="live">
          {events.map((event) => (
            <EventPanel key={event.id} event={event} now={now} player={player} onAction={onAction} />
          ))}
        </div>
      ) : (
        <nav className="strip" aria-label="Slides" style={{ gridTemplateColumns: `repeat(${Math.max(count, 1)}, minmax(0, 1fr))` }}>
          {slides.map((s, i) => {
            const { slide } = s;
            const url = brokenArt.has(slide.id) ? fallbackArt(slide.game) : artUrl(slide.art, slide.game);
            return (
              <button
                key={slide.id}
                type="button"
                className={`tile ${accentClass(slide.game)}${i === active ? " on" : ""}`}
                style={{
                  backgroundImage: `url(${JSON.stringify(url)})`,
                  backgroundPosition: `${slide.focus?.x ?? 62}% ${slide.focus?.y ?? 50}%`,
                }}
                aria-label={`Show: ${tabLabel(s)}`}
                aria-current={i === active}
                onClick={() => go(i)}
              >
                <span className="lb">
                  <small>
                    {GAME_NAMES[slide.game] ?? slide.game}
                    {slide.badge ? ` ${slide.badge}` : ""}
                  </small>
                  <b>{tabLabel(s)}</b>
                </span>
                {progress(i)}
              </button>
            );
          })}
        </nav>
      )}
      <span className="sr-only" aria-live={auto ? "off" : "polite"}>
        {slides[active] ? `Slide ${active + 1} of ${count}: ${slides[active].slide.headline}` : ""}
      </span>
    </section>
  );
}
