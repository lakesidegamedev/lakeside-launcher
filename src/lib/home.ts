// Pure helpers for the Home screen: which games to continue, what changed
// recently, and the player state the carousel uses to decide what it may show.

import type { PlayerState } from "../components/home/slides";
import type { LiveCatalog, LiveTier } from "./liveCatalog";
import { grantName } from "./liveCatalog";
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

/** Lines that are release-note furniture, not a sentence about the release. */
const BOILERPLATE = /^(what'?s (changed|new)|release notes|changelog|full changelog|new contributors)\b/i;

/**
 * One clean sentence from release notes, or "" when the notes do not have one.
 * A heading is never used. A clean sentence starts with a capital, ends with
 * a full stop, question mark or exclamation mark, has no links, code or
 * markup left in it, and fits on one line. Anything else gives "" so the
 * caller shows the version and date only.
 */
export function firstSentence(body: string, max = 110): string {
  const lines = body
    .replace(/\r/g, "")
    .split("\n")
    .filter((raw) => !/^\s*#/.test(raw))
    .map((raw) => raw.replace(/^[>*\-\s]+/, "").replace(/\*\*|__/g, "").trim())
    .filter((text) => text.length > 0 && !BOILERPLATE.test(text));
  const first = lines[0];
  if (!first) return "";
  const stop = first.search(/[.!?](\s|$)/);
  if (stop < 0) return "";
  const sentence = first.slice(0, stop + 1);
  if (sentence.length < 12 || sentence.length > max) return "";
  if (!/^[A-Z0-9]/.test(sentence)) return "";
  if (/[`\[\]<>]|https?:|\(#|\|/.test(sentence)) return "";
  return sentence;
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

/** Library row or desktop product id back to the feed's game key (accent colour, art). */
export function gameKeyForRow(rowId: string): string | null {
  for (const [game, id] of Object.entries(SLIDE_GAME_TO_ROW)) if (id === rowId) return game;
  return null;
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** "today", "yesterday", "3 days ago", then "Nov 9". */
export function lastPlayedText(playedAt: number, now: Date = new Date()): string {
  const days = Math.round((startOfDay(now) - startOfDay(new Date(playedAt))) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(playedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export interface AccountSummary {
  name: string;
  /** Tiers whose grants this account's purchases cover, or "" when none. */
  access: string;
  /** What the account includes, named from the live catalog. */
  lines: string[];
}

/**
 * The session carries no tier, so this says what the purchases cover, not what
 * the player pays: the live tiers whose every grant the account owns (the
 * dearest group, so Supporter+ and Champion appear together when they grant the
 * same things). Names come from the live catalog; nothing here grants access.
 */
export function accountSummary(
  username: string,
  catalog: LiveCatalog | null,
  entitlements: Readonly<Record<string, string>>,
  freeText: string | null,
): AccountSummary {
  const ownedIds = Object.entries(entitlements)
    .filter(([, state]) => state === "owned")
    .map(([id]) => id);
  const covered = (catalog?.subscriptions ?? []).filter(
    (tier: LiveTier) => tier.grants.length > 0 && tier.grants.every((grant) => entitlements[grant] === "owned"),
  );
  const widest = Math.max(0, ...covered.map((tier) => tier.grants.length));
  const access = covered
    .filter((tier) => tier.grants.length === widest)
    .map((tier) => tier.name)
    .join(" or ");
  const lines: string[] = [];
  if (catalog && ownedIds.length > 0) {
    const names = ownedIds.map((id) => grantName(id, catalog));
    lines.push(names.length > 3 ? `${names.slice(0, 3).join(", ")} and ${names.length - 3} more` : names.join(", "));
  } else {
    lines.push("No purchases yet. Free games are in the Library.");
  }
  if (freeText) lines.push(freeText);
  return { name: username, access, lines };
}
