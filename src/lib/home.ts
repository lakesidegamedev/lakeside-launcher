// Pure helpers for the Home screen: which games to continue, what changed
// recently, and the player state the carousel uses to decide what it may show.

import type { PlayerState } from "../components/home/slides";
import type { GameRow } from "./rows";
import type { InstallDetails, InstalledProduct, PatchNote } from "./tauri";

/** Slide game ids to library row ids. */
export const SLIDE_GAME_TO_ROW: Readonly<Record<string, string>> = {
  ahd: "ahd",
  cw: "corporate-warfare",
  gc: "grand-century",
  mov: "electioneer",
};

export function playerState(rows: readonly GameRow[]): PlayerState {
  const out: Record<string, PlayerState[string]> = {};
  for (const [slideGame, rowId] of Object.entries(SLIDE_GAME_TO_ROW)) {
    const row = rows.find((entry) => entry.product.id === rowId);
    if (!row) continue;
    const kind = row.action.kind;
    out[slideGame] = {
      owned: row.owned,
      installed: row.installedVersion !== null,
      updateAvailable: row.updateAvailable,
      playable:
        !row.actionDisabled &&
        (kind === "launch" || kind === "web" || (kind === "update" && row.installedVersion !== null)),
      installable: !row.actionDisabled && kind === "install",
      ...(row.latestVersion ? { latestVersion: row.latestVersion } : {}),
      ...(row.installedVersion ? { installedVersion: row.installedVersion } : {}),
      displayName: row.title,
    };
  }
  return out;
}

export interface ContinueEntry {
  row: GameRow;
  /** Epoch milliseconds the game was last played, or null when only installed. */
  playedAt: number | null;
}

/**
 * Installed games, most recently played first. A game never played sorts by
 * install time after every played one. At most `limit`.
 */
export function continuePlaying(
  rows: readonly GameRow[],
  installed: Readonly<Record<string, InstalledProduct>>,
  details: Readonly<Record<string, InstallDetails>>,
  limit = 3,
): ContinueEntry[] {
  const entries = rows
    .filter((row) => row.desktop !== null && row.installedVersion !== null)
    .map((row) => {
      const id = row.desktop?.id ?? "";
      return {
        row,
        playedAt: details[id]?.lastPlayedAt ?? null,
        installedAt: installed[id]?.installedAt ?? 0,
      };
    });
  entries.sort((a, b) => {
    if (a.playedAt !== null && b.playedAt !== null) return b.playedAt - a.playedAt;
    if (a.playedAt !== null) return -1;
    if (b.playedAt !== null) return 1;
    return b.installedAt - a.installedAt;
  });
  return entries.slice(0, limit).map(({ row, playedAt }) => ({ row, playedAt }));
}

export interface RecentUpdate {
  id: string;
  title: string;
  version: string;
  publishedAt: string | null;
  summary: string;
}

/** First sentence of release notes, markdown noise removed, capped for one line. */
export function firstSentence(body: string, max = 110): string {
  const lines = body
    .replace(/\r/g, "")
    .split("\n")
    .map((raw) => ({
      heading: /^\s*#/.test(raw),
      text: raw.replace(/^[#>*\-\s]+/, "").replace(/[*_`]/g, "").trim(),
    }))
    .filter((line) => line.text.length > 0 && !/^what'?s changed$/i.test(line.text));
  // A heading only stands in when the notes have nothing else to say.
  const picked = lines.find((line) => !line.heading) ?? lines[0];
  if (!picked) return "";
  const plain = picked.text;
  const stop = plain.search(/[.!?](\s|$)/);
  const sentence = stop >= 0 ? plain.slice(0, stop + 1) : plain;
  return sentence.length > max ? `${sentence.slice(0, max - 1).trimEnd()}…` : sentence;
}

/** Newest release per game, newest first. */
export function recentlyUpdated(
  notes: Readonly<Record<string, readonly PatchNote[]>>,
  titles: Readonly<Record<string, string>>,
  limit = 4,
): RecentUpdate[] {
  const out: RecentUpdate[] = [];
  for (const [id, list] of Object.entries(notes)) {
    const latest = list[0];
    if (!latest) continue;
    out.push({
      id,
      title: titles[id] ?? id,
      version: latest.version,
      publishedAt: latest.publishedAt,
      summary: firstSentence(latest.body),
    });
  }
  out.sort((a, b) => Date.parse(b.publishedAt ?? "") - Date.parse(a.publishedAt ?? "") || a.id.localeCompare(b.id));
  return out.slice(0, limit);
}
