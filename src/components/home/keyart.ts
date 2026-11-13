// Key art that ships inside the launcher: composited from real captures of each
// game, graded toward the launcher navy. The feed may name one of these keys, or
// point at an https image on an allowed studio host to override it.
import ahd from "../../assets/keyart/ahd.jpg";
import alpha from "../../assets/keyart/alpha.jpg";
import cw from "../../assets/keyart/cw.jpg";
import gc from "../../assets/keyart/gc.jpg";
import mov from "../../assets/keyart/mov.jpg";
import { bundledKey } from "./slides";

export const KEY_ART: Readonly<Record<string, string>> = { ahd, alpha, cw, gc, mov };

/** The image URL for a slide's or event's `art` value; "" when there is nothing to show. */
export function artUrl(art: string, game: string): string {
  const key = bundledKey(art, game);
  return key ? (KEY_ART[key] ?? "") : art;
}

/** The shipped plate for a game, used when a remote image fails to load. */
export function fallbackArt(game: string): string {
  return KEY_ART[game === "studio" ? "alpha" : game] ?? "";
}

export const GAME_NAMES: Readonly<Record<string, string>> = {
  ahd: "A House Divided",
  cw: "Corporate Warfare",
  mov: "Margin of Victory",
  gc: "Grand Century",
  mf: "MetroForge",
  studio: "Lakeside Games",
};
