import { useEffect, useState } from "react";
import type { Session } from "../platform/client";
import { isDesktop, readAchievements, type Achievements, type Playtime } from "../lib/tauri";

export function playtimeText(playtime?: Playtime): string {
  if (!playtime) return "-";
  const minutes = Math.floor(playtime.milliseconds / 60_000);
  if (minutes === 0) return "< 1 min";
  if (minutes < 60) return `${minutes} min`;
  const remainder = minutes % 60;
  return `${Math.floor(minutes / 60)} hr${remainder ? ` ${remainder} min` : ""}`;
}

export function GameActivity({ productId, session, playtime }: {
  productId: string;
  session: Session | null;
  playtime?: Playtime;
}): JSX.Element {
  const [result, setResult] = useState<Achievements | null>(null);
  const [failed, setFailed] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const ahd = productId === "ahd";
  const desktop = isDesktop();
  const canRead = desktop && (!ahd || !!session);

  useEffect(() => {
    if (!canRead) return;
    let current = true;
    let request = 0;
    const load = () => {
      const id = ++request;
      void readAchievements(productId).then((next) => {
        if (current && id === request) {
          setResult(next);
          setFailed(false);
        }
      }, () => {
        if (current && id === request) setFailed(true);
      });
    };
    load();
    window.addEventListener("focus", load);
    const timer = window.setInterval(load, ahd ? 300_000 : 5_000);
    return () => {
      current = false;
      window.removeEventListener("focus", load);
      window.clearInterval(timer);
    };
  }, [ahd, canRead, productId, refresh, session]);

  const achievements = canRead ? result?.achievements ?? [] : [];
  const unlocked = achievements.filter((entry) => entry.earnedAt).length;
  const status = !desktop ? "Available in the desktop launcher."
    : ahd && !session ? "Sign in with your linked account to sync A House Divided achievements."
    : failed ? (result ? "Couldn’t refresh. Showing the last successful sync." : "Couldn’t load achievements. Try refreshing.")
    : !result ? "Loading achievements…"
    : result.status === "pending" ? "A House Divided achievement sync is rolling out."
    : result.status === "unlinked" ? "Sign in with A House Divided to sync your game achievements."
    : result.status === "expired" ? "Your session has expired. Sign in again to sync."
    : result.status === "unsupported" ? "This game hasn’t connected achievements yet."
    : achievements.length === 0 ? "No achievements earned yet."
    : null;

  return (
    <section className="game-activity" aria-label="Game activity">
      <div className="playtime-summary">
        <span>Playtime on this device</span>
        <strong>{playtimeText(playtime)}</strong>
        {playtime?.running ? <span className="playing">Now playing</span> : null}
      </div>
      <header className="activity-heading">
        <h2>Achievements {achievements.length > 0 ? <span>{unlocked}{ahd ? " earned" : ` / ${achievements.length}`}</span> : null}</h2>
        {canRead && (ahd || failed) ? (
          <button type="button" className="btn sm" onClick={() => setRefresh((value) => value + 1)}>Refresh</button>
        ) : null}
      </header>
      {status ? <p className="muted" role="status">{status}</p> : null}
      {achievements.length > 0 ? (
        <ul className="achievement-list">
          {[...achievements].sort((a, b) => Number(!!b.earnedAt) - Number(!!a.earnedAt)).map((entry) => {
            const date = entry.earnedAt ? new Date(entry.earnedAt) : null;
            return (
              <li key={entry.id}>
                <div><strong>{entry.name}</strong><p>{entry.description}</p></div>
                <span>{date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString() : entry.earnedAt ? "Earned" : "Locked"}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
