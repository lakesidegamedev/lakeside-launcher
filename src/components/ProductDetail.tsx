import {
  canLaunchDesktop,
  formatPrice,
  ownsProduct,
  type Entitlements,
  type Product,
} from "../catalog";
import type { ReleaseProduct } from "../lib/tauri";

interface Props {
  product: Product;
  entitlements: Entitlements;
  release: ReleaseProduct | null;
  installedVersion: string | null;
  updateAvailable: boolean;
  installing: boolean;
  installFraction: number | null;
  canInstall: boolean;
  /** Entitled paid product with nothing published for this system yet. */
  comingTonight: boolean;
  /** Label the app computed for the main action. */
  primaryLabel: string;
  signedIn: boolean;
  onSignIn: () => void;
  busy: boolean;
  onClose: () => void;
  onLaunch: () => void;
  onInstall: () => void;
  onWeb: () => void;
  onBuy: () => void;
}

export function ProductDetail({
  product,
  entitlements,
  release,
  installedVersion,
  updateAvailable,
  installing,
  installFraction,
  canInstall,
  comingTonight,
  primaryLabel,
  signedIn,
  onSignIn,
  busy,
  onClose,
  onLaunch,
  onInstall,
  onWeb,
  onBuy,
}: Props): JSX.Element {
  const owned = ownsProduct(product, entitlements);
  const launchable = canLaunchDesktop(product, entitlements);
  const soon = product.status === "soon";

  return (
    <aside className="detail" aria-label={product.title}>
      <article className="detail-inner">
        <header className="detail-hero">
          {product.art ? (
            <img className="detail-art" src={product.art} alt="" />
          ) : (
            <span className="detail-mark">{product.mark}</span>
          )}
          <button type="button" className="detail-close" onClick={onClose} aria-label="Close">
            Close
          </button>
        </header>

        <div className="detail-body">
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
            {release ? (
              <div>
                <dt>Latest release</dt>
                <dd>
                  {release.version} · {Object.keys(release.artifacts).length} builds
                </dd>
              </div>
            ) : null}
            <div>
              <dt>Status</dt>
              <dd>
                {installedVersion
                  ? `Installed ${installedVersion}`
                  : owned
                    ? "In your library"
                    : soon
                      ? "Coming soon"
                      : "Not owned"}
              </dd>
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
            ) : launchable && comingTonight ? (
              <button type="button" className="btn primary" disabled>
                {primaryLabel}
              </button>
            ) : launchable ? (
              <>
                {!installedVersion && canInstall ? (
                  <button
                    type="button"
                    className="btn primary"
                    onClick={onInstall}
                    disabled={installing}
                  >
                    {installing
                      ? installFraction === null
                        ? "Downloading..."
                        : `Installing ${Math.round(installFraction * 100)}%`
                      : primaryLabel.startsWith("Download for")
                        ? primaryLabel
                        : `Install${release ? ` ${release.version}` : ""}`}
                  </button>
                ) : installedVersion && updateAvailable && canInstall ? (
                  <button
                    type="button"
                    className="btn primary"
                    onClick={onInstall}
                    disabled={installing}
                  >
                    {installing
                      ? installFraction === null
                        ? "Downloading..."
                        : `Installing ${Math.round(installFraction * 100)}%`
                      : `Update to ${release?.version ?? "latest"}`}
                  </button>
                ) : (
                  <button type="button" className="btn primary" onClick={onLaunch} disabled={busy}>
                    {busy ? "Opening..." : product.authenticatedDownload ? "Play" : "Launch desktop"}
                  </button>
                )}
                {installedVersion && updateAvailable && canInstall ? (
                  <button type="button" className="btn ghost" onClick={onLaunch} disabled={busy}>
                    {busy ? "Opening..." : "Launch desktop"}
                  </button>
                ) : null}
                {product.webUrl ? (
                  <button type="button" className="btn ghost" onClick={onWeb} disabled={installing}>
                    {product.webLabel ?? "Play online"}
                  </button>
                ) : null}
                {installedVersion && !updateAvailable && canInstall ? (
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={onInstall}
                    disabled={installing}
                  >
                    {installing ? "Reinstalling..." : "Reinstall latest"}
                  </button>
                ) : null}
              </>
            ) : (
              <>
                {product.authenticatedDownload && !signedIn ? (
                  <button type="button" className="btn primary" onClick={onSignIn}>
                    Sign in to install
                  </button>
                ) : null}
                {product.priceCents !== null && product.productId ? (
                  <button
                    type="button"
                    className={product.authenticatedDownload && !signedIn ? "btn ghost" : "btn primary"}
                    onClick={onBuy}
                  >
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
          {installedVersion && updateAvailable && !canInstall ? (
            <p className="detail-note">
              Version {release?.version ?? "newer"} is available, but automatic installation is
              Windows-only. Download it from the release page.
            </p>
          ) : null}
          {product.delivery === "content" ? (
            <p className="detail-note">
              Campaign packs unlock inside {product.game} on your account. Nothing to download.
            </p>
          ) : null}
        </div>
      </article>
    </aside>
  );
}
