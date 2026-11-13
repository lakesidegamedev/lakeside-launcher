import type { Product } from "../catalog";
import type { GameAction, GameState } from "./state";

/** Everything a library row or the game page needs, computed once in App. */
export interface GameRow {
  product: Product;
  /** The product that carries the desktop build, or null for browser-only games. */
  desktop: Product | null;
  title: string;
  blurb: string;
  state: GameState;
  action: GameAction;
  /** Disabled main action (nothing published yet, or work in progress). */
  actionDisabled: boolean;
  sizeText: string;
  lastPlayed: string;
  installedVersion: string | null;
  latestVersion: string | null;
  updateAvailable: boolean;
  owned: boolean;
  hasWeb: boolean;
  /** "Free until Monday 5:00 PM Eastern" while free access opens this game, else null. */
  freeText: string | null;
  /** A second way to get the game on this system: a saved .deb ("Download .deb"). */
  extraDownload?: { label: string } | null;
}
