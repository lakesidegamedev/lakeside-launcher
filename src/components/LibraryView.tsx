import { playtimeText } from "./GameActivity";
import { useState } from "react";
import type { GameRow } from "../lib/rows";
import { KEY_ART } from "./home/keyart";
import { gameKeyForRow } from "../lib/home";

type Filter = "all" | "installed" | "updates" | "browser";

interface Props {
  rows: readonly GameRow[];
  signedIn: boolean;
  onSelect: (row: GameRow) => void;
  onAction: (row: GameRow) => void;
  onSignIn: () => void;
}

export function matchesFilter(row: GameRow, filter: Filter): boolean {
  switch (filter) {
    case "installed":
      return row.installedVersion !== null;
    case "updates":
      return row.updateAvailable;
    case "browser":
      return row.hasWeb;
    default:
      return true;
  }
}

export function matchesQuery(row: GameRow, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return row.title.toLowerCase().includes(needle) || row.blurb.toLowerCase().includes(needle);
}

export function LibraryView({ rows, signedIn, onSelect, onAction, onSignIn }: Props): JSX.Element {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const counts: Record<Filter, number> = {
    all: rows.length,
    installed: rows.filter((row) => matchesFilter(row, "installed")).length,
    updates: rows.filter((row) => matchesFilter(row, "updates")).length,
    browser: rows.filter((row) => matchesFilter(row, "browser")).length,
  };
  const visible = rows.filter((row) => matchesFilter(row, filter) && matchesQuery(row, query));
  const chips: ReadonlyArray<{ id: Filter; label: string }> = [
    { id: "all", label: "All" },
    { id: "installed", label: "Installed" },
    { id: "updates", label: "Updates" },
    { id: "browser", label: "Browser" },
  ];

  return (
    <section>
      <div className="head library-heading">
        <h1>Library</h1>
        <span className="muted">
          {rows.length} games, {counts.installed} installed
        </span>
        <div className="sp">
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              className={filter === chip.id ? "chip on" : "chip"}
              aria-pressed={filter === chip.id}
              onClick={() => setFilter(chip.id)}
            >
              {chip.label} {counts[chip.id]}
            </button>
          ))}
          <label className="search">
            <span className="sr-only">Search your games</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search your games"
            />
          </label>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="empty">
          {rows.length === 0 ? "Nothing in your library yet. Open the Store to find a game." : "No games match."}
        </div>
      ) : (
        <ul className="library-grid">
          {visible.map((row) => {
            const key = gameKeyForRow(row.product.id);
            const art = key ? KEY_ART[key] : row.product.art;
            return (
              <li key={row.product.id} className="library-game">
                <button type="button" className="library-cover" onClick={() => onSelect(row)}>
                  {art ? <img src={art} alt="" /> : null}
                  <span>{row.title}</span>
                </button>
                <div className="library-game-body">
                  <div className="library-game-info">
                    <span className={`state ${row.state.tone}`}>
                      {row.playtime?.running ? "Now playing" : row.state.label}
                    </span>
                    <span className="muted">{row.freeText ?? row.state.detail ?? row.blurb}</span>
                  </div>
                  {row.playtime ? (
                    <dl className="library-playtime">
                      <div><dt>Playtime</dt><dd>{playtimeText(row.playtime)}</dd></div>
                      <div><dt>Last played</dt><dd>{row.lastPlayed}</dd></div>
                    </dl>
                  ) : null}
                </div>
                <div className="library-game-actions">
                  <button type="button" className="textlink" aria-label={`Details for ${row.title}`} onClick={() => onSelect(row)}>
                    Details
                  </button>
                  <button type="button" className="btn p" disabled={row.actionDisabled} onClick={() => onAction(row)}>
                    {row.action.label}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!signedIn ? (
        <div className="note" style={{ marginTop: 12 }}>
          You are not signed in, so only free games show here.{" "}
          <button type="button" className="textlink" onClick={onSignIn}>
            Sign in to load your purchases
          </button>
          .
        </div>
      ) : null}
    </section>
  );
}
