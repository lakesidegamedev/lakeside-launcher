import ahdArt from "./assets/media/ahd-map.webp";
import corporateWarfareArt from "./assets/media/cw-goods.jpg";
import grandCenturyArt from "./assets/media/gc-world.webp";
import marginOfVictoryArt from "./assets/media/mov-night.jpg";

// Delivery metadata only: how the launcher starts, installs and shows a game.
// Names, prices, add-ons and supporter tiers come from the live store catalog
// (lib/liveCatalog.ts). Nothing here decides money or access; the platform
// does. The names below are fallbacks for when the catalog cannot be reached.

export type Delivery = "native" | "web";
export type Platform = "windows" | "macos" | "linux" | "android" | "browser";

export type ExecutableMap = Partial<Record<Platform, string>>;

export interface Product {
  /** Stable launcher id, unique per library row or companion app. */
  id: string;
  /** Platform game key, matching the live catalog. */
  game: string;
  /** Fallback display name. The live catalog name wins when it is loaded. */
  title: string;
  /** One line shown under the name. */
  blurb: string;
  delivery: Delivery;
  platforms: readonly Platform[];
  /**
   * Entitlement ids that unlock the desktop build. Empty means free. Any one
   * owned id is enough (the first is the current id, later ones are legacy).
   */
  entitlementIds: readonly string[];
  /** Product id in the live catalog, for the price and the add-ons. */
  liveId: string | null;
  /** Live catalog game key whose add-ons belong to this game. */
  addonGame?: string;
  /** Browser build. For native products this is the free online companion. */
  webUrl: string | null;
  /** Relative paths from the install root, one per supported platform. */
  executables: ExecutableMap | null;
  /**
   * Fetch the installer through the accounts download endpoint with the stored
   * session (paid builds) instead of the public manifest URL.
   */
  authenticatedDownload?: boolean;
  /**
   * Opt in to the launcher handoff: the game starts with LAKESIDE_LAUNCHER env
   * and, when signed in, a single-use code bound to this client id.
   */
  handoffClientId?: string;
  /** Store page the Buy button opens. */
  storeUrl: string;
  /**
   * Account page for a browser download on platforms the launcher cannot
   * install on (macOS until there is a Mac launcher build).
   */
  browserDownloadUrl?: string;
  /**
   * Native app found through its own Windows uninstall entry (publisher
   * "Lakeside Games") rather than the launcher install root.
   */
  registryApp?: boolean;
  /** Set on a desktop companion that shares a library row with another product. */
  companionOf?: string;
  /** Library row that owns this companion's desktop app, in the other direction. */
  companion?: string;
  accent: string;
  mark: string;
  art: string | null;
  installSizeMb: number | null;
}

export const CATALOG: readonly Product[] = [
  {
    id: "ahd",
    game: "ahd",
    title: "A House Divided",
    blurb: "Multiplayer politics",
    delivery: "native",
    platforms: ["windows", "macos", "linux", "android", "browser"],
    entitlementIds: ["ahd-singleplayer", "ahd-client"],
    liveId: "ahd-singleplayer",
    webUrl: "https://www.ahousedividedgame.com",
    executables: {
      windows: "AHDClient/ahdclient-desktop.exe",
      macos: "AHDClient.app/Contents/MacOS/AHDClient",
      linux: "AHDClient/ahdclient.AppImage",
    },
    storeUrl: "https://lakesidegames.net/store/a-house-divided",
    accent: "#e8b04a",
    mark: "AHD",
    art: ahdArt,
    installSizeMb: 210,
  },
  {
    id: "electioneer",
    game: "electioneer",
    title: "Margin of Victory",
    blurb: "Elections, free base game",
    delivery: "web",
    platforms: ["browser", "windows"],
    entitlementIds: [],
    liveId: null,
    addonGame: "electioneer",
    webUrl: "https://lakesidegames.net/games/margin-of-victory/",
    executables: null,
    storeUrl: "https://lakesidegames.net/store/margin-of-victory",
    companion: "margin-of-victory",
    accent: "#e8607a",
    mark: "MoV",
    art: marginOfVictoryArt,
    installSizeMb: null,
  },
  {
    id: "margin-of-victory",
    game: "electioneer",
    title: "Margin of Victory desktop app",
    blurb: "The desktop app for Margin of Victory",
    delivery: "native",
    platforms: ["windows"],
    entitlementIds: [],
    liveId: null,
    webUrl: "https://lakesidegames.net/games/margin-of-victory/",
    executables: null,
    handoffClientId: "margin-of-victory",
    registryApp: true,
    companionOf: "electioneer",
    storeUrl: "https://lakesidegames.net/store/margin-of-victory",
    accent: "#e8607a",
    mark: "MoV",
    art: marginOfVictoryArt,
    installSizeMb: null,
  },
  {
    id: "corporate-warfare",
    game: "corporate-warfare",
    title: "Corporate Warfare",
    blurb: "Single player, works offline",
    delivery: "native",
    platforms: ["windows", "linux", "macos"],
    entitlementIds: ["corporate-warfare"],
    liveId: "corporate-warfare",
    webUrl: null,
    executables: {
      windows: "Programs/Corporate Warfare/Corporate Warfare.exe",
      linux: "CorporateWarfare/CorporateWarfare.AppImage",
    },
    authenticatedDownload: true,
    handoffClientId: "corporate-warfare-desktop",
    storeUrl: "https://lakesidegames.net/store/corporate-warfare",
    browserDownloadUrl: "https://lakesidegames.net/account",
    accent: "#45c4a4",
    mark: "CW",
    art: corporateWarfareArt,
    installSizeMb: 84,
  },
  {
    id: "grand-century",
    game: "grand-century",
    title: "Grand Century",
    blurb: "Early access, free in your browser",
    delivery: "web",
    platforms: ["browser"],
    entitlementIds: [],
    liveId: null,
    webUrl: "https://lakesidegames.net/games/grand-century/",
    executables: null,
    companion: "grand-century-desktop",
    storeUrl: "https://lakesidegames.net/store/grand-century",
    accent: "#7d9ad8",
    mark: "GC",
    art: grandCenturyArt,
    installSizeMb: null,
  },
  {
    // Installs from the manifest entry of the same id. Until a desktop release
    // exists the row has no desktop build to offer and stays "Play in browser".
    id: "grand-century-desktop",
    game: "grand-century",
    title: "Grand Century desktop app",
    blurb: "The desktop app for Grand Century",
    delivery: "native",
    platforms: ["windows", "linux", "macos"],
    entitlementIds: [],
    liveId: null,
    webUrl: "https://lakesidegames.net/games/grand-century/",
    executables: {
      windows: "GrandCentury/GrandCentury.exe",
      linux: "GrandCentury/GrandCentury.AppImage",
    },
    companionOf: "grand-century",
    storeUrl: "https://lakesidegames.net/store/grand-century",
    accent: "#7d9ad8",
    mark: "GC",
    art: grandCenturyArt,
    installSizeMb: null,
  },
];

export const PRODUCTS_BY_ID: ReadonlyMap<string, Product> = new Map(
  CATALOG.map((product) => [product.id, product]),
);

export type EntitlementState = "owned" | "refunded";
export type Entitlements = Readonly<Record<string, EntitlementState>>;

/** Free products need no entitlement; gated ones need one owned purchase id. */
export function ownsProduct(product: Product, entitlements: Entitlements): boolean {
  if (product.entitlementIds.length === 0) return true;
  return product.entitlementIds.some((id) => entitlements[id] === "owned");
}

/** Whether the desktop binary may launch. The online companion stays free. */
export function canLaunchDesktop(product: Product, entitlements: Entitlements): boolean {
  return product.delivery === "native" && ownsProduct(product, entitlements);
}

/** Installer kinds the launcher can run, per platform. A Mac disk image is opened for the player. */
export function installerSupported(kind: string, platform: Platform): boolean {
  if (platform === "windows") return kind === "nsis" || kind === "inno";
  if (platform === "linux") return kind === "appimage";
  if (platform === "macos") return kind === "dmg";
  return false;
}

export function executableFor(product: Product, platform: Platform): string | null {
  if (!product.executables) return null;
  return product.executables[platform] ?? null;
}

export function formatPrice(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

/**
 * Library rows: every game the player owns, plus anything playable in the
 * browser for free. Desktop companions share the row of the game they belong to.
 */
export function libraryProducts(entitlements: Entitlements): readonly Product[] {
  return CATALOG.filter(
    (product) =>
      !product.companionOf && (ownsProduct(product, entitlements) || product.webUrl !== null),
  );
}
