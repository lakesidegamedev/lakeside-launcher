import { HomeShowcase } from "./home/HomeShowcase";
import { KEY_ART } from "./home/keyart";
import type { ActionType, HomeFeed, PlayerState } from "./home/slides";
import type { FreeAccess } from "../lib/freeAccess";
import { gameKeyForRow, lastPlayedText, type AccountSummary, type ContinueEntry, type RecentUpdate } from "../lib/home";
import type { GameRow } from "../lib/rows";

interface Props {
  feed: HomeFeed | null;
  freeAccess: FreeAccess;
  player: PlayerState;
  onSlideAction: (action: { type: ActionType; target: string }) => void;
  continueList: readonly ContinueEntry[];
  recent: readonly RecentUpdate[];
  account: AccountSummary | null;
  libraryCount: number;
  onPlay: (row: GameRow) => void;
  onUpdate: (row: GameRow) => void;
  onOpenGame: (id: string) => void;
  onLibrary: () => void;
  onAccount: () => void;
}

function shortDate(iso: string | null): string {
  if (!iso) return "";
  const time = Date.parse(iso);
  return Number.isNaN(time) ? "" : new Date(time).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const accent = (game: string | null): string => (game ? `${game}c` : "lkc");

export function HomeView({
  feed,
  freeAccess,
  player,
  onSlideAction,
  continueList,
  recent,
  account,
  libraryCount,
  onPlay,
  onUpdate,
  onOpenGame,
  onLibrary,
  onAccount,
}: Props): JSX.Element {
  return (
    <section className="home">
      <HomeShowcase feed={feed} player={player} freeAccess={freeAccess} onAction={onSlideAction} />

      <div className="below">
        <div>
          <h2>
            Jump back in
            <button type="button" onClick={onLibrary}>
              {libraryCount === 1 ? "1 game in Library" : `All ${libraryCount} games in Library`}
            </button>
          </h2>
          {continueList.length > 0 ? (
            <div className="jb">
              {continueList.map(({ row, playedAt }) => {
                const game = gameKeyForRow(row.product.id);
                const art = game ? KEY_ART[game] : undefined;
                return (
                  <div className={`jt ${accent(game)}`} key={row.product.id}>
                    <div className="jart" style={art ? { backgroundImage: `url(${JSON.stringify(art)})`, backgroundPosition: "58% 45%" } : undefined} />
                    <button type="button" className="jopen" onClick={() => onOpenGame(row.product.id)}>
                      <b>{row.title}</b>
                      <small>
                        {playedAt ? (
                          <>
                            Last played <em>{lastPlayedText(playedAt)}</em>
                          </>
                        ) : (
                          "Not played yet"
                        )}
                      </small>
                      <small>
                        {row.updateAvailable && row.latestVersion ? (
                          <span className="upd">{row.latestVersion} ready</span>
                        ) : (
                          `Installed ${row.installedVersion ?? ""}`
                        )}
                      </small>
                    </button>
                    <div className="jact">
                      {row.updateAvailable ? (
                        <button type="button" className="btn p sm" onClick={() => onUpdate(row)}>
                          Update
                        </button>
                      ) : (
                        <button type="button" className="btn p sm" onClick={() => onPlay(row)}>
                          Play
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="none">Nothing installed yet. Pick a game from the Library or the Store.</p>
          )}
        </div>

        <div className="cols2">
          <div>
            <h2>What changed</h2>
            {recent.length > 0 ? (
              <table className="feed">
                <tbody>
                  {recent.map((entry) => {
                    const game = gameKeyForRow(entry.id);
                    return (
                      <tr key={entry.id} className={accent(game)}>
                        <td>
                          <button type="button" className="g2" onClick={() => onOpenGame(entry.id)}>
                            <span className="dot" />
                            {entry.title}
                          </button>
                        </td>
                        <td>
                          <span className="tag">{entry.version.replace(/^v/i, "").replace(/\.0$/, "")}</span>
                        </td>
                        <td className="s">{entry.summary}</td>
                        <td className="d">{shortDate(entry.publishedAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p className="none">Release notes appear here once your games have published some.</p>
            )}
          </div>

          {account ? (
            <div>
              <h2>
                Your account
                <button type="button" onClick={onAccount}>
                  Manage
                </button>
              </h2>
              <div className="acc">
                <div className="ah">
                  <span className="av" aria-hidden="true">
                    {account.name.slice(0, 1).toUpperCase()}
                  </span>
                  <div>
                    <b>{account.name}</b>
                    <small>{account.access ? `Access matches ${account.access}` : "No supporter tier on this account"}</small>
                  </div>
                  <button type="button" className="btn sm" onClick={onAccount}>
                    Account
                  </button>
                </div>
                <ul>
                  {account.lines.map((line) => (
                    <li key={line}>
                      <span className="dot" style={{ background: "var(--ok)" }} />
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
