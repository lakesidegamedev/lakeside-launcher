// The live store catalog and how the launcher merges it with its own delivery
// metadata. The server owns names, prices, add-ons and supporter tiers; the
// launcher owns how a game is started. Nothing here grants access.

import { formatPrice, ownsProduct, type Entitlements, type Product } from "../catalog";
import { CATALOG_SNAPSHOT } from "./catalogSnapshot";
import { fetchLiveCatalog } from "./tauri";

export interface LiveProduct {
  id: string;
  game: string;
  name: string;
  description: string;
  priceCents: number;
  currency: string;
}

export interface LiveTier {
  id: string;
  name: string;
  priceCents: number;
  interval: string;
  currency: string;
  grants: readonly string[];
}

export interface LiveCatalog {
  products: readonly LiveProduct[];
  subscriptions: readonly LiveTier[];
  subscriptionsAvailable: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Read the catalog response defensively. Unknown shapes return null. */
export function parseLiveCatalog(raw: unknown): LiveCatalog | null {
  if (!isRecord(raw) || !Array.isArray(raw.products)) return null;
  const products: LiveProduct[] = [];
  for (const entry of raw.products) {
    if (!isRecord(entry)) continue;
    if (entry.listed === false) continue;
    if (typeof entry.id !== "string" || typeof entry.name !== "string") continue;
    if (typeof entry.priceCents !== "number") continue;
    products.push({
      id: entry.id,
      game: typeof entry.game === "string" ? entry.game : "",
      name: entry.name,
      description: typeof entry.description === "string" ? entry.description : "",
      priceCents: entry.priceCents,
      currency: typeof entry.currency === "string" ? entry.currency : "usd",
    });
  }
  const subscriptions: LiveTier[] = [];
  if (Array.isArray(raw.subscriptions)) {
    for (const entry of raw.subscriptions) {
      if (!isRecord(entry)) continue;
      if (typeof entry.id !== "string" || typeof entry.name !== "string") continue;
      if (typeof entry.priceCents !== "number") continue;
      subscriptions.push({
        id: entry.id,
        name: entry.name,
        priceCents: entry.priceCents,
        interval: typeof entry.interval === "string" ? entry.interval : "month",
        currency: typeof entry.currency === "string" ? entry.currency : "usd",
        grants: Array.isArray(entry.grants)
          ? entry.grants.filter((grant): grant is string => typeof grant === "string")
          : [],
      });
    }
  }
  return {
    products,
    subscriptions,
    subscriptionsAvailable: raw.subscriptionsAvailable !== false,
  };
}

export interface CatalogResult {
  catalog: LiveCatalog;
  /** True when this is the live catalog, false for the bundled copy. */
  live: boolean;
}

/** Load the live catalog, falling back to the bundled copy. */
export async function loadCatalog(): Promise<CatalogResult> {
  try {
    const catalog = parseLiveCatalog(await fetchLiveCatalog());
    if (catalog && catalog.products.length > 0) return { catalog, live: true };
  } catch {
    // Offline or blocked: use the bundled copy below.
  }
  return { catalog: CATALOG_SNAPSHOT, live: false };
}

const GRANT_NAMES: Record<string, string> = {
  "ahd-singleplayer": "A House Divided single-player",
  sandbox: "AHD sandbox",
  complete: "Margin of Victory Complete Collection",
};

export function grantName(id: string, catalog: LiveCatalog): string {
  return GRANT_NAMES[id] ?? findLive(catalog, id)?.name ?? id;
}

export function tierPrice(tier: LiveTier): string {
  return `${formatPrice(tier.priceCents, tier.currency)} / ${tier.interval}`;
}

export function findLive(catalog: LiveCatalog, id: string | null): LiveProduct | null {
  if (!id) return null;
  return catalog.products.find((product) => product.id === id) ?? null;
}

/** The add-ons that belong to a game: its live products, minus the game itself. */
export function addonsFor(product: Product, catalog: LiveCatalog): readonly LiveProduct[] {
  if (!product.addonGame) return [];
  return catalog.products.filter(
    (entry) => entry.game === product.addonGame && entry.id !== product.liveId,
  );
}

export interface AddOnRow {
  key: string;
  name: string;
  detail: string;
  /** Price in cents for a single item, null when it is a group of different prices. */
  priceCents: number | null;
  priceText: string;
  owned: boolean;
  /** A group of equally priced packs shown as one row. */
  group: boolean;
}

/**
 * Add-on rows for the game page and the store. Equal-priced single items (the
 * country packs) collapse into one row so fourteen countries do not bury the
 * Complete Collection.
 */
export function addOnRows(
  addons: readonly LiveProduct[],
  entitlements: Entitlements,
): readonly AddOnRow[] {
  const owns = (id: string): boolean => entitlements[id] === "owned";
  const rows: AddOnRow[] = [];
  const packs = addons.filter((entry) => entry.id !== "complete");
  const complete = addons.find((entry) => entry.id === "complete");
  if (complete) {
    rows.push({
      key: complete.id,
      name: complete.name,
      detail: complete.description,
      priceCents: complete.priceCents,
      priceText: formatPrice(complete.priceCents, complete.currency),
      owned: owns(complete.id),
      group: false,
    });
  }
  if (packs.length > 0) {
    const cents = packs.map((pack) => pack.priceCents);
    const same = cents.every((value) => value === cents[0]);
    const currency = packs[0]?.currency ?? "usd";
    const ownedCount = packs.filter((pack) => owns(pack.id)).length;
    rows.push({
      key: "packs",
      name: "Country packs",
      detail:
        `${packs.length} countries, every election in that country` +
        (ownedCount > 0 ? `. You own ${ownedCount}` : ""),
      priceCents: same ? (cents[0] ?? null) : null,
      priceText: same
        ? `${formatPrice(cents[0] ?? 0, currency)} each`
        : `from ${formatPrice(Math.min(...cents), currency)}`,
      owned: ownedCount === packs.length,
      group: true,
    });
  }
  return rows;
}

/** One line of price for the store row of a game. */
export function priceSummary(
  product: Product,
  catalog: LiveCatalog,
  entitlements: Entitlements,
): string {
  const edition = findLive(catalog, product.liveId);
  const rows = addOnRows(addonsFor(product, catalog), entitlements);
  const cheapest = rows
    .map((row) => row.priceCents)
    .filter((value): value is number => value !== null);
  if (edition) {
    const price = formatPrice(edition.priceCents, edition.currency);
    return product.webUrl ? `Free to play, single-player ${price}` : price;
  }
  if (cheapest.length > 0) {
    const low = Math.min(...cheapest);
    return `Free base game, packs from ${formatPrice(low, "usd")}`;
  }
  return "Free";
}

export function ownedLabel(
  product: Product,
  entitlements: Entitlements,
): "owned" | "free" | "buy" {
  if (product.entitlementIds.length === 0) return "free";
  return ownsProduct(product, entitlements) ? "owned" : "buy";
}
