// The launcher catalog. Phase 0 mirrors the commercial fields that already
// live in lakeside-accounts/products.js (id, game, price) plus the delivery
// metadata a launcher needs (web URL or native executable).
//
// Prices are display-only here. Checkout and entitlement decisions remain on
// the platform: the launcher never sends an amount and never trusts this file
// for access. Keep ids in sync with products.js until the manifest service
// becomes the single source.

export type Delivery = "native" | "web" | "content";
export type ProductStatus = "available" | "soon";
export type Platform = "windows" | "macos" | "linux" | "android" | "browser";

export type ExecutableMap = Partial<Record<Platform, string>>;

export interface Product {
  /** Stable launcher id, unique per tile or store line. */
  id: string;
  /** Platform game key, matching products.js. */
  game: string;
  title: string;
  tagline: string;
  description: string;
  delivery: Delivery;
  status: ProductStatus;
  platforms: readonly Platform[];
  /** Price in cents, or null when free. Display only. */
  priceCents: number | null;
  currency: "usd";
  /** Commercial product id used for entitlements, matching products.js. */
  productId: string | null;
  /** Browser build. For native products this is the free online companion. */
  webUrl: string | null;
  webLabel: string | null;
  /** Relative paths from the install root, one per supported platform. */
  executables: ExecutableMap | null;
  accent: string;
  mark: string;
  installSizeMb: number | null;
}

export const CATALOG: readonly Product[] = [
  {
    id: "ahd",
    game: "ahd",
    title: "A House Divided",
    tagline: "A living world that keeps moving",
    description:
      "A persistent multiplayer political and economic simulation. Play in the browser for free, or run the desktop client for local singleplayer worlds, world simulation and offline saves.",
    delivery: "native",
    status: "available",
    platforms: ["windows", "macos", "linux", "android", "browser"],
    priceCents: 2000,
    currency: "usd",
    productId: "ahd-client",
    webUrl: "https://www.ahousedividedgame.com",
    webLabel: "Play multiplayer online",
    executables: {
      windows: "AHDClient/AHDClient.exe",
      macos: "AHDClient.app/Contents/MacOS/AHDClient",
      linux: "AHDClient/ahdclient.AppImage",
    },
    accent: "#b23a48",
    mark: "AHD",
    installSizeMb: 210,
  },
  {
    id: "electioneer",
    game: "electioneer",
    title: "Margin of Victory",
    tagline: "Rewrite an election in half an hour",
    description:
      "A scenario-driven election game built on real campaigns, events and results. Base scenarios are free; historical packs unlock the full US, UK and global roster.",
    delivery: "web",
    status: "available",
    platforms: ["browser"],
    priceCents: null,
    currency: "usd",
    productId: null,
    webUrl: "https://sim.ahousedividedgame.com",
    webLabel: "Play in browser",
    executables: null,
    accent: "#3f6f8f",
    mark: "MoV",
    installSizeMb: null,
  },
  {
    id: "corporate-warfare",
    game: "corporate-warfare",
    title: "Corporate Warfare",
    tagline: "Own the economy instead of the country",
    description:
      "A corporate strategy simulation. Free to download for Windows and Linux, with the source published on GitHub.",
    delivery: "native",
    status: "available",
    platforms: ["windows", "linux"],
    priceCents: null,
    currency: "usd",
    productId: null,
    webUrl: null,
    webLabel: null,
    executables: {
      windows: "CorporateWarfare/CorporateWarfare.exe",
      linux: "CorporateWarfare/corporate-warfare",
    },
    accent: "#7a6a3a",
    mark: "CW",
    installSizeMb: 84,
  },
  {
    id: "grand-century",
    game: "grand-century",
    title: "Grand Century",
    tagline: "Take a century apart in one sitting",
    description:
      "A century-scale strategy game. The browser build is not public yet; this tile is a placeholder for the launcher's release channel.",
    delivery: "web",
    status: "soon",
    platforms: ["browser"],
    priceCents: null,
    currency: "usd",
    productId: null,
    webUrl: null,
    webLabel: null,
    executables: null,
    accent: "#4b6b57",
    mark: "GC",
    installSizeMb: null,
  },
  {
    id: "us-historical",
    game: "electioneer",
    title: "US Historical Elections",
    tagline: "Ten US races, 1980 to 2016",
    description: "Ten US presidential races with their real campaign events.",
    delivery: "content",
    status: "available",
    platforms: ["browser"],
    priceCents: 499,
    currency: "usd",
    productId: "us-historical",
    webUrl: null,
    webLabel: null,
    executables: null,
    accent: "#3f6f8f",
    mark: "US",
    installSizeMb: null,
  },
  {
    id: "uk-elections",
    game: "electioneer",
    title: "UK General Elections",
    tagline: "Thirteen UK general elections",
    description: "Thirteen UK general elections from 1951 to 2024.",
    delivery: "content",
    status: "available",
    platforms: ["browser"],
    priceCents: 799,
    currency: "usd",
    productId: "uk-elections",
    webUrl: null,
    webLabel: null,
    executables: null,
    accent: "#3f6f8f",
    mark: "UK",
    installSizeMb: null,
  },
  {
    id: "global",
    game: "electioneer",
    title: "Global Elections Pack",
    tagline: "Nine elections across four countries",
    description: "Canada, Germany, France and Australia, nine elections in all.",
    delivery: "content",
    status: "available",
    platforms: ["browser"],
    priceCents: 599,
    currency: "usd",
    productId: "global",
    webUrl: null,
    webLabel: null,
    executables: null,
    accent: "#3f6f8f",
    mark: "GL",
    installSizeMb: null,
  },
  {
    id: "complete",
    game: "electioneer",
    title: "Complete Collection",
    tagline: "Every scenario in Margin of Victory",
    description: "The full US, UK and global roster in one purchase.",
    delivery: "content",
    status: "available",
    platforms: ["browser"],
    priceCents: 999,
    currency: "usd",
    productId: "complete",
    webUrl: null,
    webLabel: null,
    executables: null,
    accent: "#3f6f8f",
    mark: "ALL",
    installSizeMb: null,
  },
];

export const PRODUCTS_BY_ID: ReadonlyMap<string, Product> = new Map(
  CATALOG.map((product) => [product.id, product]),
);

export type EntitlementState = "owned" | "refunded";
export type Entitlements = Readonly<Record<string, EntitlementState>>;

/** Free products need no entitlement; paid ones need an owned purchase. */
export function ownsProduct(product: Product, entitlements: Entitlements): boolean {
  if (product.priceCents === null) return true;
  if (!product.productId) return false;
  return entitlements[product.productId] === "owned";
}

/** Whether the desktop binary may launch. The online companion stays free. */
export function canLaunchDesktop(product: Product, entitlements: Entitlements): boolean {
  return product.delivery === "native" && ownsProduct(product, entitlements);
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

/** The store lists priced products the player does not own yet. */
export function storeProducts(entitlements: Entitlements): readonly Product[] {
  return CATALOG.filter(
    (product) => product.priceCents !== null && !ownsProduct(product, entitlements),
  );
}

/** Library lists everything owned, free, or bundled as content. */
export function libraryProducts(entitlements: Entitlements): readonly Product[] {
  return CATALOG.filter(
    (product) => product.delivery !== "content" && ownsProduct(product, entitlements),
  );
}
