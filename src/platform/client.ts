// Typed boundary around the two platform services the launcher talks to:
// lakeside-auth for identity and lakeside-accounts for purchases. Phase 0 ships
// a demo implementation plus a live client that targets endpoints which are
// specified here but not deployed yet.
//
// Nothing in this file is a source of truth for money or access. The launcher
// renders; the platform decides.

import {
  isDesktop,
  platformEntitlements,
  platformExchange,
  platformSession,
  platformSignOut,
} from "../lib/tauri";

export type IdentityProvider = "ahd" | "discord" | "demo";

export interface Session {
  username: string;
  email: string | null;
  /** "ahd", "discord" or "demo". Kept as a string because the platform owns the set. */
  provider: string;
  avatarUrl: string | null;
}

export type EntitlementState = "owned" | "refunded";
export type Entitlements = Readonly<Record<string, EntitlementState>>;

export interface PlatformClient {
  readonly mode: "demo" | "live";
  getSession(): Promise<Session | null>;
  exchange(code: string): Promise<Session>;
  signOut(): Promise<void>;
  getEntitlements(): Promise<Entitlements>;
}

const SESSION_KEY = "lakeside.launcher.session";
const ENTITLEMENTS_KEY = "lakeside.launcher.entitlements";

// Demo library: a player who owns A House Divided, Corporate Warfare and one country pack.
const DEMO_SESSION: Session = {
  username: "demo-player",
  email: "demo@lakesidegames.net",
  provider: "demo",
  avatarUrl: null,
};

const DEMO_ENTITLEMENTS: Entitlements = {
  "ahd-singleplayer": "owned",
  "corporate-warfare": "owned",
  "uk-elections": "owned",
};

function readStorage<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A locked-down webview can refuse storage; the session simply does not
    // survive a reload.
  }
}

class DemoClient implements PlatformClient {
  readonly mode = "demo" as const;

  async getSession(): Promise<Session | null> {
    if (localStorage.getItem(SESSION_KEY) === "signed-out") return null;
    return readStorage<Session>(SESSION_KEY) ?? DEMO_SESSION;
  }

  async exchange(_code: string): Promise<Session> {
    writeStorage(SESSION_KEY, DEMO_SESSION);
    writeStorage(ENTITLEMENTS_KEY, DEMO_ENTITLEMENTS);
    return DEMO_SESSION;
  }

  async signOut(): Promise<void> {
    localStorage.setItem(SESSION_KEY, "signed-out");
    localStorage.removeItem(ENTITLEMENTS_KEY);
  }

  async getEntitlements(): Promise<Entitlements> {
    if (localStorage.getItem(SESSION_KEY) === "signed-out") return {};
    return readStorage<Entitlements>(ENTITLEMENTS_KEY) ?? DEMO_ENTITLEMENTS;
  }
}

/**
 * Live client. Identity and entitlements are fetched by the Rust side, which
 * keeps the session token out of the webview and avoids CORS entirely.
 * The platform contract:
 *   POST /launcher/session      { code } -> { token, session }
 *   GET  /launcher/entitlements           -> { entitlements: { [productId]: state } }
 */
class LiveClient implements PlatformClient {
  readonly mode = "live" as const;

  async getSession(): Promise<Session | null> {
    if (!isDesktop()) return null;
    return (await platformSession()) as Session | null;
  }

  async exchange(code: string): Promise<Session> {
    return (await platformExchange(code)) as Session;
  }

  async signOut(): Promise<void> {
    await platformSignOut();
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(ENTITLEMENTS_KEY);
  }

  async getEntitlements(): Promise<Entitlements> {
    try {
      const next = (await platformEntitlements()) as Entitlements;
      writeStorage(ENTITLEMENTS_KEY, next);
      return next;
    } catch {
      // Boot into the last known library rather than a spinner.
      return readStorage<Entitlements>(ENTITLEMENTS_KEY) ?? {};
    }
  }
}

export function createPlatformClient(): PlatformClient {
  const requested = import.meta.env.VITE_PLATFORM_MODE as string | undefined;
  // The shipped desktop app is live; a browser preview has no Rust bridge and
  // falls back to the local demo library.
  const mode = requested ?? (isDesktop() ? "live" : "demo");
  return mode === "live" ? new LiveClient() : new DemoClient();
}
