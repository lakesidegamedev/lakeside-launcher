/**
 * Home carousel. Self-contained; the app shell imports this one component.
 *
 * Props:
 *   feed          Parsed, already signature-verified home.json (or null when
 *                 unavailable). Slides are validated again here.
 *   player        What this machine knows per game id: owned, installed,
 *                 updateAvailable, playable, installable, versions.
 *   artFor        Bundled art for a game id, used for the local Update slide.
 *   onAction      Called with the slide's action when the button is pressed.
 *                 The shell decides how to install, update, play or open a page.
 *   freeAccess    True while the studio free-access switch is on (free-to-play slides need it).
 *   now           Optional clock for tests and previews. Defaults to the current time.
 *
 * Behaviour: auto-advances every 7 s; pauses on hover and focus; stops while
 * the window is hidden; no auto-advance and no animation when the user prefers
 * reduced motion; previous and next buttons, labelled dots, Left and Right keys.
 * Renders nothing when no slide is actionable.
 */
import { useEffect, useMemo, useReducer, useState } from "react";
import "./home.css";
import { blurLeaves, indexForKey, initialPause, pauseReducer } from "./pause";
import {
  ADVANCE_MS,
  buildSlides,
  shouldAutoAdvance,
  wrapIndex,
  type HomeFeed,
  type PlayerState,
  type SlideAction,
} from "./slides";

export interface HomeCarouselProps {
  feed: HomeFeed | null;
  player: PlayerState;
  artFor: (game: string) => string;
  onAction: (action: SlideAction) => void;
  now?: Date;
  /** The studio free-access switch is on; free-to-play slides show only while it is. */
  freeAccess?: boolean;
}

const KIND_LABEL = {
  release: "New release",
  update: "Update ready",
  free: "Free to play",
  pack: "Country pack",
  news: "Studio news",
} as const;

const BUTTON_LABEL = {
  install: "Install",
  update: "Update",
  play: "Play",
  store: "Open store page",
  news: "Read the post",
} as const;

function usePrefersReducedMotion(): boolean {
  const [r, setR] = useState(() => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const q = matchMedia("(prefers-reduced-motion: reduce)");
    const f = () => setR(q.matches);
    q.addEventListener("change", f);
    return () => q.removeEventListener("change", f);
  }, []);
  return r;
}

export function HomeCarousel({ feed, player, artFor, onAction, now, freeAccess }: HomeCarouselProps) {
  const built = useMemo(() => buildSlides(feed, player, now ?? new Date(), artFor, { freeAccess }), [feed, player, artFor, now, freeAccess]);
  // A slide without its picture is not worth showing: drop it when the art fails to load.
  const [brokenArt, setBrokenArt] = useState<ReadonlySet<string>>(new Set());
  const slides = useMemo(() => built.filter((slide) => !brokenArt.has(slide.id)), [built, brokenArt]);
  const [index, setIndex] = useState(0);
  const [pause, dispatch] = useReducer(
    pauseReducer,
    typeof document !== "undefined" && document.hidden,
    initialPause,
  );
  const { hovered, focused, hidden } = pause;
  const reducedMotion = usePrefersReducedMotion();
  const count = slides.length;

  useEffect(() => {
    const f = () => dispatch({ type: "visibility", hidden: document.hidden });
    document.addEventListener("visibilitychange", f);
    return () => document.removeEventListener("visibilitychange", f);
  }, []);

  useEffect(() => {
    if (index >= count) setIndex(0);
  }, [count, index]);

  const advancing = shouldAutoAdvance({ reducedMotion, hovered, focused, hidden, count });
  useEffect(() => {
    if (!advancing) return;
    const t = setInterval(() => setIndex((i) => wrapIndex(i + 1, count)), ADVANCE_MS);
    return () => clearInterval(t);
  }, [advancing, count]);

  if (count === 0) return null;
  const go = (n: number) => setIndex(wrapIndex(n, count));

  return (
    <section
      className="hm-car"
      aria-roledescription="carousel"
      aria-label="What is new"
      tabIndex={0}
      onMouseEnter={() => dispatch({ type: "mouseenter" })}
      onMouseLeave={() => dispatch({ type: "mouseleave" })}
      onFocus={() => dispatch({ type: "focus" })}
      onBlur={(e) =>
        dispatch({ type: "blur", stillInside: !blurLeaves(e.currentTarget, e.relatedTarget) })
      }
      onKeyDown={(e) => {
        const next = indexForKey(e.key, index, count);
        if (next !== null) go(next);
      }}
    >
      {slides.map((s, i) => (
        <div
          key={s.id}
          className={`hm-slide${i === index ? " hm-on" : ""}`}
          role="group"
          aria-roledescription="slide"
          aria-label={`${i + 1} of ${count}`}
          hidden={i !== index}
        >
          <div className="hm-txt">
            <span className="hm-kind">{KIND_LABEL[s.kind]}</span>
            <h2 className="hm-hl">{s.headline}</h2>
            <p>{s.line}</p>
            <button type="button" className="hm-btn" onClick={() => onAction(s.action)}>
              {BUTTON_LABEL[s.action.type]}
            </button>
          </div>
          <img
            className="hm-art"
            src={s.art}
            alt=""
            onError={() => setBrokenArt((previous) => new Set(previous).add(s.id))}
          />
        </div>
      ))}
      <div className="hm-ctl">
        <button type="button" className="hm-arrow" aria-label="Previous slide" onClick={() => go(index - 1)}>
          &#8249;
        </button>
        <button type="button" className="hm-arrow" aria-label="Next slide" onClick={() => go(index + 1)}>
          &#8250;
        </button>
        <div className="hm-dots">
          {slides.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className={`hm-dot${i === index ? " hm-on" : ""}`}
              aria-label={`Slide ${i + 1}: ${KIND_LABEL[s.kind]}`}
              aria-current={i === index}
              onClick={() => go(i)}
            />
          ))}
        </div>
        <span className="hm-count" aria-live={advancing ? "off" : "polite"}>
          {index + 1} of {count}
        </span>
      </div>
    </section>
  );
}
