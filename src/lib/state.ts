// What a library row says about a game, and which action it offers. Pure, so
// the labels can be tested without rendering anything.

export type StateKind = "update" | "installed" | "web" | "not-installed" | "included" | "not-owned";

export interface GameStateInput {
  /** The player may use the desktop build (free, purchased, or via a tier). */
  owned: boolean;
  /** The game has a desktop build at all. */
  hasDesktop: boolean;
  hasWeb: boolean;
  installedVersion: string | null;
  latestVersion: string | null;
  updateAvailable: boolean;
  /** The launcher can install it on this system. */
  canInstall: boolean;
  /** Name of the supporter tier that includes it, when that is how it is owned. */
  includedWith?: string | null;
}

export interface GameState {
  kind: StateKind;
  label: string;
  detail: string | null;
  tone: "ok" | "warn" | "plain" | "muted";
}

export function gameState(input: GameStateInput): GameState {
  const { installedVersion, latestVersion } = input;
  if (input.hasDesktop && input.owned && installedVersion) {
    if (input.updateAvailable) {
      return {
        kind: "update",
        label: "Update available",
        detail: latestVersion
          ? `Installed ${installedVersion}, new ${latestVersion}`
          : `Installed ${installedVersion}`,
        tone: "warn",
      };
    }
    return {
      kind: "installed",
      label: `Installed ${installedVersion}`,
      detail: "Up to date",
      tone: "ok",
    };
  }
  if (input.hasWeb) {
    return {
      kind: "web",
      label: "Play in browser",
      detail:
        input.hasDesktop && input.owned && input.canInstall
          ? "Desktop app not installed"
          : input.hasDesktop && !input.owned
            ? "Desktop build not owned"
            : null,
      tone: "plain",
    };
  }
  if (input.hasDesktop && input.owned) {
    return {
      kind: input.includedWith ? "included" : "not-installed",
      label: input.includedWith ? `Included with ${input.includedWith}` : "Not installed",
      detail: input.includedWith ? "Not installed" : latestVersion,
      tone: "muted",
    };
  }
  return { kind: "not-owned", label: "Not owned", detail: null, tone: "muted" };
}

export type ActionKind = "update" | "install" | "launch" | "web" | "buy" | "none";

export interface GameAction {
  kind: ActionKind;
  label: string;
}

export interface GameActionInput extends GameStateInput {
  /** Install or update in progress, 0..1, or null when the size is unknown. */
  installing: boolean;
  installFraction: number | null;
  /** The desktop build can be started (executable known for this system). */
  canLaunch: boolean;
  priceText: string | null;
}

/** The single next thing a player would do with this game. */
export function gameAction(input: GameActionInput): GameAction {
  if (input.installing) {
    return {
      kind: "none",
      label:
        input.installFraction === null
          ? "Installing..."
          : `Installing ${Math.round(input.installFraction * 100)}%`,
    };
  }
  if (input.hasDesktop && input.owned) {
    if (input.installedVersion) {
      if (input.updateAvailable && input.canInstall) return { kind: "update", label: "Update" };
      if (input.canLaunch) return { kind: "launch", label: "Play" };
    } else if (input.canInstall) {
      return { kind: "install", label: "Install" };
    }
  }
  if (input.hasWeb) return { kind: "web", label: input.hasDesktop ? "Play in browser" : "Play" };
  if (input.priceText) return { kind: "buy", label: `Buy ${input.priceText}` };
  return { kind: "none", label: "Unavailable" };
}
