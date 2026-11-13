import { describe, expect, it } from "vitest";
import { gameAction, gameState, type GameActionInput } from "./state";

const base: GameActionInput = {
  owned: true,
  hasDesktop: true,
  hasWeb: false,
  installedVersion: null,
  latestVersion: "2.11.0",
  updateAvailable: false,
  canInstall: true,
  includedWith: null,
  installing: false,
  installFraction: null,
  canLaunch: true,
  priceText: null,
};

describe("state labels", () => {
  it("says Update available with both versions", () => {
    const state = gameState({ ...base, installedVersion: "2.10.4", updateAvailable: true });
    expect(state.label).toBe("Update available");
    expect(state.detail).toBe("Installed 2.10.4, new 2.11.0");
    expect(state.tone).toBe("warn");
  });

  it("says Installed with the version when up to date", () => {
    const state = gameState({ ...base, installedVersion: "2.11.0" });
    expect(state.label).toBe("Installed 2.11.0");
    expect(state.tone).toBe("ok");
  });

  it("says Play in browser for a browser game, and notes the missing desktop app", () => {
    const state = gameState({ ...base, hasWeb: true });
    expect(state.label).toBe("Play in browser");
    expect(state.detail).toBe("Desktop app not installed");
  });

  it("says Not installed for a desktop-only game that is owned", () => {
    expect(gameState(base).label).toBe("Not installed");
  });

  it("says Included with Supporter when a tier is why it is owned", () => {
    const state = gameState({ ...base, includedWith: "Supporter" });
    expect(state.kind).toBe("included");
    expect(state.label).toBe("Included with Supporter");
  });

  it("prefers the installed state over Play in browser", () => {
    const state = gameState({ ...base, hasWeb: true, installedVersion: "1.0.0" });
    expect(state.label).toBe("Installed 1.0.0");
  });

  it("does not offer a desktop state without a purchase", () => {
    const state = gameState({ ...base, owned: false, hasWeb: true, installedVersion: "2.0.0" });
    expect(state.label).toBe("Play in browser");
    expect(state.detail).toBe("Desktop build not owned");
  });

  it("says Not owned for a paid desktop-only game", () => {
    expect(gameState({ ...base, owned: false }).label).toBe("Not owned");
  });
});

describe("one primary action per row", () => {
  it("offers Install when owned and not installed", () => {
    expect(gameAction(base)).toEqual({ kind: "install", label: "Install" });
  });

  it("offers Update before Play", () => {
    const action = gameAction({ ...base, installedVersion: "2.10.4", updateAvailable: true });
    expect(action.kind).toBe("update");
  });

  it("offers Play when installed and current", () => {
    expect(gameAction({ ...base, installedVersion: "2.11.0" }).kind).toBe("launch");
  });

  it("falls back to the browser when the desktop build cannot be installed here", () => {
    const action = gameAction({ ...base, hasWeb: true, canInstall: false });
    expect(action).toEqual({ kind: "web", label: "Play in browser" });
  });

  it("offers Buy with the live price when the game is not owned", () => {
    const action = gameAction({ ...base, owned: false, priceText: "$14.99" });
    expect(action).toEqual({ kind: "buy", label: "Buy $14.99" });
  });

  it("shows install progress instead of an action", () => {
    expect(gameAction({ ...base, installing: true, installFraction: 0.62 })).toEqual({
      kind: "none",
      label: "Installing 62%",
    });
    expect(gameAction({ ...base, installing: true }).label).toBe("Installing...");
  });
});
