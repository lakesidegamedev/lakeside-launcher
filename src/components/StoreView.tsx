import { type Entitlements, type Product } from "../catalog";
import { GameCard } from "./GameCard";

interface Props {
  products: readonly Product[];
  entitlements: Entitlements;
  signedIn: boolean;
  selectedId: string | null;
  onSelect: (product: Product) => void;
  onBuy: (product: Product) => void;
  onSignIn: () => void;
}

export function StoreView({
  products,
  entitlements,
  signedIn,
  selectedId,
  onSelect,
  onBuy,
  onSignIn,
}: Props): JSX.Element {
  const games = products.filter((product) => product.delivery !== "content");
  const content = products.filter((product) => product.delivery === "content");

  function renderGrid(list: readonly Product[]): JSX.Element {
    return (
      <div className="grid">
        {list.map((product) => (
          <GameCard
            key={product.id}
            product={product}
            entitlements={entitlements}
            mode="store"
            chip={{ label: "", tone: "muted" }}
            selected={selectedId === product.id}
            busy={false}
            actionLabel={
              product.status === "soon" ? "Coming soon" : signedIn ? "Buy" : "Sign in to buy"
            }
            onSelect={() => onSelect(product)}
            onAction={() => (signedIn ? onBuy(product) : onSignIn())}
          />
        ))}
      </div>
    );
  }

  return (
    <section className="view">
      {products.length === 0 ? (
        <div className="empty">
          <h2>You own everything in the store</h2>
          <p>New games and packs will appear here when they ship.</p>
        </div>
      ) : null}
      {games.length > 0 ? (
        <>
          <h2 className="section-title">Games</h2>
          {renderGrid(games)}
        </>
      ) : null}
      {content.length > 0 ? (
        <>
          <h2 className="section-title">Campaign packs</h2>
          {renderGrid(content)}
        </>
      ) : null}
    </section>
  );
}
