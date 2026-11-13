import { formatPrice, ownsProduct, type Entitlements, type Product } from "../catalog";

export type ChipTone = "ok" | "warn" | "muted" | "info";

interface Props {
  product: Product;
  entitlements: Entitlements;
  actionLabel: string;
  chip: { label: string; tone: ChipTone };
  mode: "library" | "store";
  selected: boolean;
  busy: boolean;
  onSelect: () => void;
  onAction: () => void;
}

export function GameCard({
  product,
  entitlements,
  actionLabel,
  chip,
  mode,
  selected,
  busy,
  onSelect,
  onAction,
}: Props): JSX.Element {
  const owned = ownsProduct(product, entitlements);
  const disabled = product.status === "soon" || busy;
  const price =
    product.priceCents === null ? "Free" : formatPrice(product.priceCents, product.currency);

  return (
    <article
      className={selected ? "game-card is-selected" : "game-card"}
      onClick={onSelect}
    >
      <div className="game-art">
        {product.art ? (
          <img className="game-art-img" src={product.art} alt="" loading="lazy" />
        ) : (
          <span className="game-mark">{product.mark}</span>
        )}
      </div>
      <div className="game-body">
        <div className="game-head">
          <h3>{product.title}</h3>
          {mode === "store" ? (
            <span className="price">{owned ? "Owned" : price}</span>
          ) : (
            <span className={`chip ${chip.tone}`}>{chip.label}</span>
          )}
        </div>
        <p>{product.tagline}</p>
        <button
          type="button"
          className="btn primary wide"
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation();
            onAction();
          }}
        >
          {busy ? "Opening..." : actionLabel}
        </button>
      </div>
    </article>
  );
}
