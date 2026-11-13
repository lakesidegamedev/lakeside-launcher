// The studio free-access switch (a free weekend). Pure helpers, no network.

import { CATALOG, type Entitlements, type Product } from "../catalog";

export interface FreeAccess {
  on: boolean;
  /** ISO time the free access ends, when the studio set one. */
  endsAt: string | null;
}

export const FREE_ACCESS_OFF: FreeAccess = { on: false, endsAt: null };

/** Read the public answer. Anything unexpected means off. */
export function parseFreeAccess(body: unknown): FreeAccess {
  if (!body || typeof body !== "object") return FREE_ACCESS_OFF;
  const record = body as Record<string, unknown>;
  if (record.on !== true) return FREE_ACCESS_OFF;
  const ends = typeof record.endsAt === "string" && !Number.isNaN(Date.parse(record.endsAt)) ? record.endsAt : null;
  return { on: true, endsAt: ends };
}

/** "Free until Monday 5:00 PM Eastern", or "Free for now" when there is no end time. */
export function freeUntilText(access: FreeAccess, now: Date = new Date()): string | null {
  if (!access.on) return null;
  if (!access.endsAt) return "Free for now";
  const end = new Date(access.endsAt);
  if (end.getTime() <= now.getTime()) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
  }).formatToParts(end);
  const pick = (type: string): string => parts.find((part) => part.type === type)?.value ?? "";
  return `Free until ${pick("weekday")} ${pick("hour")}:${pick("minute")} ${pick("dayPeriod")} Eastern`;
}

/** True while free access is on and has not run out. */
export function freeAccessActive(access: FreeAccess, now: Date = new Date()): boolean {
  return freeUntilText(access, now) !== null;
}

/** Paid products the player does not own for real but can use while free access is on. */
export function freeGrantedIds(
  access: FreeAccess,
  entitlements: Entitlements,
  products: readonly Product[] = CATALOG,
  now: Date = new Date(),
): ReadonlySet<string> {
  const granted = new Set<string>();
  if (!freeAccessActive(access, now)) return granted;
  for (const product of products) {
    if (product.entitlementIds.length === 0) continue;
    if (product.entitlementIds.some((id) => entitlements[id] === "owned")) continue;
    granted.add(product.id);
  }
  return granted;
}

/** The player's purchases plus everything free access opens up. */
export function withFreeAccess(
  access: FreeAccess,
  entitlements: Entitlements,
  products: readonly Product[] = CATALOG,
  now: Date = new Date(),
): Entitlements {
  const granted = freeGrantedIds(access, entitlements, products, now);
  if (granted.size === 0) return entitlements;
  const next: Record<string, "owned" | "refunded"> = { ...entitlements };
  for (const product of products) {
    if (granted.has(product.id) && product.entitlementIds[0]) next[product.entitlementIds[0]] = "owned";
  }
  return next;
}
