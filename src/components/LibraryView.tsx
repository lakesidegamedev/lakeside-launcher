import { useState } from "react";
import type { Entitlements, Product } from "../catalog";
import { GameCard } from "./GameCard";

interface Props {
  products: readonly Product[];
  entitlements: Entitlements;
  busy: string | null;
  signedIn: boolean;
  primaryLabel: (product: Product) => string;
  onSelect: (product: Product) => void;
  onPrimary: (product: Product) => void;
  onWeb: (product: Product) => void;
  onSignIn: () => void;
  onBrowseStore: () => void;
}

export function LibraryView({
  products,
  entitlements,
  busy,
  signedIn,
  primaryLabel,
  onSelect,
  onPrimary,
  onWeb,
  onSignIn,
  onBrowseStore,
}: Props): JSX.Element {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const visible = needle
    ? products.filter(
        (product) =>
          product.title.toLowerCase().includes(needle) ||
          product.tagline.toLowerCase().includes(needle) ||
          product.game.toLowerCase().includes(needle),
      )
    : products;

  return (
    <section className="view">
      <div className="view-tools">
        <label className="search">
          <span className="sr-only">Search library</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search your library"
            type="search"
          />
        </label>
        {!signedIn ? (
          <button type="button" className="btn ghost" onClick={onSignIn}>
            Sign in to load purchases
          </button>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <div className="empty">
          <h2>{needle ? "No games match that search" : "Your library is empty"}</h2>
          <p>
            {needle
              ? "Try a shorter search, or clear it to see everything."
              : signedIn
                ? "Buy a game or a campaign pack and it will appear here."
                : "Sign in to load the games already attached to your account."}
          </p>
          <div className="empty-actions">
            {!signedIn ? (
              <button type="button" className="btn primary" onClick={onSignIn}>
                Sign in
              </button>
            ) : null}
            <button type="button" className="btn ghost" onClick={onBrowseStore}>
              Browse the store
            </button>
          </div>
        </div>
      ) : (
        <div className="grid">
          {visible.map((product) => (
            <GameCard
              key={product.id}
              product={product}
              entitlements={entitlements}
              busy={busy === product.id}
              actionLabel={primaryLabel(product)}
              onSelect={() => onSelect(product)}
              onAction={() =>
                product.delivery === "web" ? onWeb(product) : onPrimary(product)
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}
