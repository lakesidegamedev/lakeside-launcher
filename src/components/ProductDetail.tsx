import {
  canLaunchDesktop,
  formatPrice,
  ownsProduct,
  type Entitlements,
  type Product,
} from "../catalog";

interface Props {
  product: Product;
  entitlements: Entitlements;
  busy: boolean;
  onClose: () => void;
  onLaunch: () => void;
  onWeb: () => void;
  onBuy: () => void;
}

export function ProductDetail({
  product,
  entitlements,
  busy,
  onClose,
  onLaunch,
  onWeb,
  onBuy,
}: Props): JSX.Element {
  const owned = ownsProduct(product, entitlements);
  const launchable = canLaunchDesktop(product, entitlements);
  const soon = product.status === "soon";

  return (
    <div
      className="detail-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={product.title}
      onClick={onClose}
    >
      <article
        className="detail"
        style={{ ["--card-accent" as string]: product.accent }}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="detail-hero">
          <span className="detail-mark">{product.mark}</span>
          <button type="button" className="detail-close" onClick={onClose} aria-label="Close">
            Close
          </button>
        </header>

        <div className="detail-body">
          <p className="eyebrow">{product.game}</p>
          <h2>{product.title}</h2>
          <p className="detail-tagline">{product.tagline}</p>
          <p className="detail-description">{product.description}</p>

          <dl className="detail-facts">
            <div>
              <dt>Delivery</dt>
              <dd>{product.delivery === "native" ? "Desktop app" : product.delivery === "web" ? "Browser" : "In-game content"}</dd>
            </div>
            <div>
              <dt>Platforms</dt>
              <dd>{product.platforms.join(", ")}</dd>
            </div>
            <div>
              <dt>Price</dt>
              <dd>
                {product.priceCents === null
                  ? "Free"
                  : formatPrice(product.priceCents, product.currency)}
              </dd>
            </div>
            {product.installSizeMb !== null ? (
              <div>
                <dt>Download</dt>
                <dd>{product.installSizeMb} MB</dd>
              </div>
            ) : null}
            <div>
              <dt>Status</dt>
              <dd>{owned ? "In your library" : soon ? "Coming soon" : "Not owned"}</dd>
            </div>
          </dl>

          <div className="detail-actions">
            {soon ? (
              <button type="button" className="btn primary" disabled>
                Coming soon
              </button>
            ) : product.delivery === "web" ? (
              <button type="button" className="btn primary" onClick={onWeb}>
                {product.webLabel ?? "Play in browser"}
              </button>
            ) : launchable ? (
              <>
                <button type="button" className="btn primary" onClick={onLaunch} disabled={busy}>
                  {busy ? "Opening..." : "Launch desktop"}
                </button>
                {product.webUrl ? (
                  <button type="button" className="btn ghost" onClick={onWeb}>
                    {product.webLabel ?? "Play online"}
                  </button>
                ) : null}
              </>
            ) : (
              <>
                {product.priceCents !== null && product.productId ? (
                  <button type="button" className="btn primary" onClick={onBuy}>
                    Buy for {formatPrice(product.priceCents, product.currency)}
                  </button>
                ) : null}
                {product.webUrl ? (
                  <button type="button" className="btn ghost" onClick={onWeb}>
                    {product.webLabel ?? "Play online for free"}
                  </button>
                ) : null}
              </>
            )}
          </div>

          {product.delivery === "native" && !launchable ? (
            <p className="detail-note">
              The desktop client needs a purchase. The browser game stays free and does not
              need this install.
            </p>
          ) : null}
          {product.delivery === "content" ? (
            <p className="detail-note">
              Campaign packs unlock inside {product.game} on your account. Nothing to download.
            </p>
          ) : null}
        </div>
      </article>
    </div>
  );
}
