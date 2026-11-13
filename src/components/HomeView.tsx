import type { SlideAction } from "./home/slides";
import { HomeCarousel } from "./home/HomeCarousel";
import type { HomeFeed } from "./home/slides";
import type { PlayerState } from "./home/slides";
import type { ContinueEntry, RecentUpdate } from "../lib/home";
import type { GameRow } from "../lib/rows";
import { Thumb } from "./Thumb";

interface Props {
  feed: HomeFeed | null;
  freeAccess: boolean;
  player: PlayerState;
  artFor: (game: string) => string;
  onSlideAction: (action: SlideAction) => void;
  continueList: readonly ContinueEntry[];
  recent: readonly RecentUpdate[];
  onPlay: (row: GameRow) => void;
  onOpenGame: (id: string) => void;
  onLibrary: () => void;
}

function shortDate(iso: string | null): string {
  if (!iso) return "";
  const time = Date.parse(iso);
  return Number.isNaN(time)
    ? ""
    : new Date(time).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function HomeView({
  feed,
  freeAccess,
  player,
  artFor,
  onSlideAction,
  continueList,
  recent,
  onPlay,
  onOpenGame,
  onLibrary,
}: Props): JSX.Element {
  return (
    <section>
      <HomeCarousel
        feed={feed}
        freeAccess={freeAccess}
        player={player}
        artFor={artFor}
        onAction={onSlideAction}
      />

      {continueList.length > 0 ? (
        <>
          <h2>Continue playing</h2>
          <table>
            <tbody>
              {continueList.map(({ row, playedAt }) => (
                <tr key={row.product.id}>
                  <td className="art">
                    <Thumb product={row.product} />
                  </td>
                  <td>
                    <button type="button" className="link" onClick={() => onOpenGame(row.product.id)}>
                      <b>{row.title}</b>
                    </button>
                    <br />
                    <small className="muted">
                      {playedAt ? `Last played ${shortDate(new Date(playedAt).toISOString())}` : `Installed ${row.installedVersion}`}
                    </small>
                  </td>
                  <td className="r">
                    {row.action.kind === "launch" ? (
                      <button type="button" className="btn sm p" onClick={() => onPlay(row)}>
                        Play
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}

      {recent.length > 0 ? (
        <>
          <h2>Recently updated</h2>
          <table>
            <tbody>
              {recent.map((entry) => (
                <tr key={entry.id}>
                  <td>
                    <button type="button" className="link" onClick={() => onOpenGame(entry.id)}>
                      <b>{entry.title}</b>
                    </button>{" "}
                    <span className="muted">{entry.version}</span>
                  </td>
                  <td className="wrap">{entry.summary}</td>
                  <td className="r muted">{shortDate(entry.publishedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}

      <p className="muted small" style={{ marginTop: 14 }}>
        Everything you own is in the{" "}
        <button type="button" className="link" onClick={onLibrary}>
          Library
        </button>
        .
      </p>
    </section>
  );
}
