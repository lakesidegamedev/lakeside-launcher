import { formatPrice, ownsProduct, type Entitlements, type Product } from "../catalog";

interface Props {
  products: readonly Product[];
  entitlements: Entitlements;
  signedIn: boolean;
  onSelect: (product: Product) => void;
  onBuy: (product: Product) => void;
  onSignIn: () => void;
}

function StoreRow({
  product,
  entitlements,
  signedIn,
  onSelect,
  onBuy,
  onSignIn,
}: {
  product: Product;
  entitlements: Entitlements;
  signedIn: boolean;
  onSelect: (product: Product) => void;
  onBuy: (product: Product) => void;
  onSignIn: () => void;
}): JSX.Element {
  const owned = ownsProduct(product, entitlements);
  return (
    <article className="store-row" onClick={() => onSelect(product)}>
      <span className="store-mark" style={{ background: product.accent }}>
        {product.mark}
      </span>
      <div className="store-copy">
        <h3>
          {product.title}
          <small>{product.game}</small>
        </h3>
        <p>{product.description}</p>
      </div>
      <div className="store-buy">
        <strong>
          {product.priceCents === null ? "Free" : formatPrice(product.priceCents, product.currency)}
        </strong>
        {product.status === "soon" ? (
          <span className="badge">Coming soon</span>
        ) : owned ? (
          <span className="badge owned">Owned</span>
        ) : signedIn ? (
          <button
            type="button"
            className="btn small primary"
            onClick={(event) => {
              event.stopPropagation();
              onBuy(product);
            }}
          >
            Buy
          </button>
        ) : (
          <button
            type="button"
            className="btn small"
            onClick={(event) => {
              event.stopPropagation();
              onSignIn();
            }}
          >
            Sign in to buy
          </button>
        )}
      </div>
    </article>
  );
}

export function StoreView({
  products,
  entitlements,
  signedIn,
  onSelect,
  onBuy,
  onSignIn,
}: Props): JSX.Element {
  const games = products.filter((product) => product.delivery !== "content");
  const content = products.filter((product) => product.delivery === "content");

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
          <div className="store-list">
            {games.map((product) => (
              <StoreRow
                key={product.id}
                product={product}
                entitlements={entitlements}
                signedIn={signedIn}
                onSelect={onSelect}
                onBuy={onBuy}
                onSignIn={onSignIn}
              />
            ))}
          </div>
        </>
      ) : null}

      {content.length > 0 ? (
        <>
          <h2 className="section-title">Campaign packs</h2>
          <div className="store-list">
            {content.map((product) => (
              <StoreRow
                key={product.id}
                product={product}
                entitlements={entitlements}
                signedIn={signedIn}
                onSelect={onSelect}
                onBuy={onBuy}
                onSignIn={onSignIn}
              />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
