import { formatPrice, ownsProduct, type Entitlements, type Product } from "../catalog";

interface Props {
  product: Product;
  entitlements: Entitlements;
  actionLabel: string;
  busy: boolean;
  onSelect: () => void;
  onAction: () => void;
}

export function GameCard({
  product,
  entitlements,
  actionLabel,
  busy,
  onSelect,
  onAction,
}: Props): JSX.Element {
  const owned = ownsProduct(product, entitlements);
  const disabled = product.status === "soon" || busy;

  return (
    <article
      className="game-card"
      style={{ ["--card-accent" as string]: product.accent }}
      onClick={onSelect}
    >
      <div className="game-art">
        <span className="game-mark">{product.mark}</span>
        <span className={owned ? "badge owned" : "badge"}>
          {product.status === "soon"
            ? "Coming soon"
            : owned
              ? "In library"
              : product.priceCents !== null
                ? formatPrice(product.priceCents, product.currency)
                : "Free"}
        </span>
      </div>
      <div className="game-body">
        <h3>{product.title}</h3>
        <p>{product.tagline}</p>
        <div className="game-foot">
          <span className="platforms">{product.platforms.slice(0, 3).join(" · ")}</span>
          <button
            type="button"
            className="btn small"
            disabled={disabled}
            onClick={(event) => {
              event.stopPropagation();
              onAction();
            }}
          >
            {busy ? "Opening..." : actionLabel}
          </button>
        </div>
      </div>
    </article>
  );
}
