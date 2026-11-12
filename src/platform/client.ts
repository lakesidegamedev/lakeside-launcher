// Typed boundary around the two platform services the launcher talks to:
// lakeside-auth for identity and lakeside-accounts for purchases. Phase 0 ships
// a demo implementation plus a live client that targets endpoints which are
// specified here but not deployed yet.
//
// Nothing in this file is a source of truth for money or access. The launcher
// renders; the platform decides.

export type IdentityProvider = "ahd" | "discord" | "demo";

export interface Session {
  username: string;
  email: string | null;
  provider: IdentityProvider;
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

// Phase 0 demo library: a player who owns the AHD client and one campaign pack.
const DEMO_SESSION: Session = {
  username: "demo-player",
  email: "demo@lakesidegames.net",
  provider: "demo",
  avatarUrl: null,
};

const DEMO_ENTITLEMENTS: Entitlements = {
  "ahd-client": "owned",
  "us-historical": "owned",
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

const API_BASE = (import.meta.env.VITE_PLATFORM_API as string | undefined) ?? "https://lakesidegames.net";

/**
 * Live client. These endpoints are the Phase 2 contract:
 *   POST /launcher/session      { code } -> { session }
 *   GET  /launcher/entitlements           -> { entitlements: { [productId]: state } }
 *   POST /launcher/logout
 * They do not exist yet; the UI reports that plainly instead of pretending.
 */
class LiveClient implements PlatformClient {
  readonly mode = "live" as const;

  async getSession(): Promise<Session | null> {
    return readStorage<Session>(SESSION_KEY);
  }

  async exchange(code: string): Promise<Session> {
    const res = await fetch(`${API_BASE}/launcher/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    if (!res.ok) {
      throw new Error(
        res.status === 404
          ? "The launcher sign-in endpoint is not deployed yet. Run in demo mode (VITE_PLATFORM_MODE=demo)."
          : `Sign-in failed (${res.status}).`,
      );
    }
    const body = (await res.json()) as { session: Session };
    writeStorage(SESSION_KEY, body.session);
    return body.session;
  }

  async signOut(): Promise<void> {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(ENTITLEMENTS_KEY);
  }

  async getEntitlements(): Promise<Entitlements> {
    const cached = readStorage<Entitlements>(ENTITLEMENTS_KEY);
    try {
      const res = await fetch(`${API_BASE}/launcher/entitlements`, { credentials: "include" });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { entitlements: Entitlements };
      writeStorage(ENTITLEMENTS_KEY, body.entitlements);
      return body.entitlements;
    } catch {
      // Boot into the last known library rather than a spinner.
      return cached ?? {};
    }
  }
}

export function createPlatformClient(): PlatformClient {
  const mode = (import.meta.env.VITE_PLATFORM_MODE as string | undefined) ?? "demo";
  return mode === "live" ? new LiveClient() : new DemoClient();
}
