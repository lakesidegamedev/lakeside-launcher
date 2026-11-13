import { useState } from "react";
import type { GameRow } from "../lib/rows";
import { Thumb } from "./Thumb";

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
      <div className="head">
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
        <table className="lib">
          <thead>
            <tr>
              <th style={{ width: "36%" }}>Game</th>
              <th>State</th>
              <th>Size</th>
              <th>Last played</th>
              <th className="r">Action</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.product.id}>
                <td>
                  <button type="button" className="rowlink" onClick={() => onSelect(row)}>
                    <Thumb product={row.product} />
                    <span>
                      <b>
                        <span className="dot" style={{ background: row.product.accent }} /> {row.title}
                      </b>
                      <small>{row.blurb}</small>
                    </span>
                  </button>
                </td>
                <td>
                  <span className={`state ${row.state.tone}`}>{row.state.label}</span>
                  {row.freeText ? (
                    <>
                      <br />
                      <small className="owned">{row.freeText}</small>
                    </>
                  ) : null}
                  {row.state.detail ? (
                    <>
                      <br />
                      <small className="muted">{row.state.detail}</small>
                    </>
                  ) : null}
                </td>
                <td>{row.sizeText}</td>
                <td>{row.lastPlayed}</td>
                <td className="r">
                  <button
                    type="button"
                    className="btn p"
                    disabled={row.actionDisabled}
                    onClick={() => onAction(row)}
                  >
                    {row.action.label}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
