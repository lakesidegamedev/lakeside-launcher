import { formatPrice, type Entitlements, type Product } from "../catalog";
import {
  addOnRows,
  addonsFor,
  findLive,
  tierDescription,
  ownedLabel,
  priceSummary,
  tiersIncluding,
  tierPrice,
  type LiveCatalog,
} from "../lib/liveCatalog";
import { Thumb } from "./Thumb";

interface Props {
  catalog: LiveCatalog | null;
  /** False when this is the bundled copy because the live one could not be read. */
  live: boolean;
  entitlements: Entitlements;
  /** Paid products open only because free access is on, and the "Free until ..." wording. */
  freeIds?: ReadonlySet<string>;
  freeText?: string | null;
  /** The public free-access wording ("Free until ..."), shown signed in or not. Null when off. */
  freeWeek?: string | null;
  products: readonly Product[];
  signedIn: boolean;
  onBuy: (product: Product) => void;
  onSignIn?: () => void;
  onOpenUrl: (url: string) => void;
  onOpenGame: (product: Product) => void;
  onRefresh: () => void;
}

const PLATFORM_NAMES: Record<string, string> = {
  windows: "Windows",
  macos: "macOS",
  linux: "Linux",
  android: "Android",
  browser: "Web",
};

export function StoreView({
  catalog,
  live,
  entitlements,
  freeIds,
  freeText,
  freeWeek = null,
  products,
  signedIn,
  onBuy,
  onSignIn,
  onOpenUrl,
  onOpenGame,
  onRefresh,
}: Props): JSX.Element {
  if (!catalog) return <div className="loading">Loading the store...</div>;

  const addonItems = products.flatMap((product) =>
    addOnRows(addonsFor(product, catalog), entitlements).map((row) => ({ product, row })),
  );
  // While free access is on, no paid item shows a price or a Buy button: it says
  // Free (usual price struck through), and signed-out players are asked to sign in.
  const free = freeWeek !== null;
  const paid = (product: Product): boolean => product.entitlementIds.length > 0 && !product.staffOnly;
  // Add-on rows (Margin of Victory packs) are opened by free access too, although the base
  // product has no entitlement of its own. Staff-only products stay out.
  const addonFree = (product: Product): boolean => !product.staffOnly;
  const freePrice = (usual: string): JSX.Element => (
    <>
      Free{" "}
      <small className="muted">
        <s>{usual}</s>
      </small>
    </>
  );
  // Free access shows up in the entitlements as owned. For the store that is not owning:
  // the game is free for now, so it gets the Free treatment, not Owned.
  // Packs of a game with no base entitlement are never merged in, so owning one is real.
  const bought = (product: Product, owned: boolean): boolean =>
    owned && !(free && freeIds?.has(product.id) && product.entitlementIds.length > 0);
  const freeAction = (owned: boolean): JSX.Element =>
    owned ? (
      <span className="owned">Owned</span>
    ) : signedIn ? (
      <span className="tag">Free</span>
    ) : (
      <button type="button" className="btn sm p" onClick={onSignIn}>
        Sign in to play free
      </button>
    );
  const editions = products
    .map((product) => ({ product, edition: findLive(catalog, product.liveId) }))
    .filter((entry) => entry.edition !== null && entry.product.webUrl !== null);

  return (
    <section>
      <div className="trust">
        <span>
          Sold by <b>Lakeside Games</b>
        </span>
        <span>
          Card payments by <b>Stripe</b>
        </span>
        <span>
          <b>Refunds within 14 days, no questions asked</b>
        </span>
        <span>Receipt by email</span>
        <span>One Lakeside account for every game</span>
      </div>
      <div className="head tight">
        <h1>Store</h1>
        <span className="muted">
          {free
            ? `Every game is free to play right now${signedIn ? "" : " with a free Lakeside account"}.`
            : "Buy once, keep it on your Lakeside account."}
        </span>
        <div className="sp">
          {signedIn ? (
            <button type="button" className="btn sm" onClick={onRefresh}>
              Refresh purchases
            </button>
          ) : null}
        </div>
      </div>
      {!live ? (
        <div className="note" style={{ marginTop: 8 }}>
          Could not reach the store just now. These are the last known prices; the store page shows the
          current ones.
        </div>
      ) : null}

      {freeText || freeWeek ? (
        <div className="note" style={{ marginBottom: 8 }}>
          {freeText ?? freeWeek}: install and play every paid game, no purchase needed.
          {!signedIn && onSignIn ? (
            <>
              {" "}
              <button type="button" className="btn sm p" onClick={onSignIn}>
                Sign in to play free
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      <h2>Games</h2>
      <table>
        <tbody>
          {products.map((product) => {
            const owned = ownedLabel(product, entitlements);
            return (
              <tr key={product.id}>
                <td>
                  <div className="rowlink static">
                    <Thumb product={product} />
                    <span>
                      <b>
                        <span className="dot" style={{ background: product.accent }} /> {product.title}
                      </b>
                      <small>
                        {product.platforms.map((platform) => PLATFORM_NAMES[platform] ?? platform).join(", ")}.{" "}
                        {product.blurb}
                      </small>
                    </span>
                  </div>
                </td>
                <td>
                  <b>
                    {free && (paid(product) || (product.addonGame && addonFree(product))) && !bought(product, owned === "owned")
                      ? freePrice(
                          priceSummary(product, catalog, entitlements).replace(/^Free (to play|base game), /, ""),
                        )
                      : priceSummary(product, catalog, entitlements)}
                  </b>
                </td>
                <td>
                  {freeIds?.has(product.id) && freeText ? (
                    <span className="owned">{freeText}</span>
                  ) : owned === "owned" ? (
                    <span className="owned">Owned</span>
                  ) : owned === "free" ? (
                    <span className="tag">Free</span>
                  ) : null}
                </td>
                <td className="r">
                  {owned === "buy" && free && !signedIn ? (
                    <button type="button" className="btn sm p" onClick={onSignIn}>
                      Sign in to play free
                    </button>
                  ) : owned === "buy" && !free ? (
                    <button type="button" className="btn sm p" onClick={() => onBuy(product)}>
                      Buy
                    </button>
                  ) : null}{" "}
                  <button type="button" className="btn sm" onClick={() => onOpenGame(product)}>
                    Details
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {addonItems.length > 0 ? (
        <>
          <h2>Add-ons</h2>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Game</th>
                <th>What you get</th>
                <th className="r">Price</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {addonItems.map(({ product, row }) => (
                <tr key={`${product.id}-${row.key}`}>
                  <td>
                    <b>{row.name}</b>
                  </td>
                  <td>{product.title}</td>
                  <td className="wrap">{row.detail}</td>
                  <td className="r">
                    <b>{free && addonFree(product) && !bought(product, row.owned) ? freePrice(row.priceText) : row.priceText}</b>
                  </td>
                  <td className="r">
                    {free && addonFree(product) ? (
                      freeAction(bought(product, row.owned))
                    ) : row.owned ? (
                      <span className="owned">Owned</span>
                    ) : (
                      <button
                        type="button"
                        className={row.group ? "btn sm" : "btn sm p"}
                        onClick={() => onBuy(product)}
                      >
                        {row.group ? "Choose" : "Buy"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {editions.map(({ product, edition }) =>
                edition ? (
                  <tr key={`${product.id}-edition`}>
                    <td>
                      <b>{edition.name}</b>
                    </td>
                    <td>{product.title}</td>
                    <td className="wrap">
                      {(() => {
                        const included = tiersIncluding(catalog, product.liveId).map((tier) => tier.name);
                        return included.length > 0
                          ? `Yours to keep, or included with ${included.join(", ")}`
                          : "Yours to keep";
                      })()}
                    </td>
                    <td className="r">
                      <b>
                        {free && paid(product) && !bought(product, product.entitlementIds.some((id) => entitlements[id] === "owned"))
                          ? freePrice(formatPrice(edition.priceCents, edition.currency))
                          : formatPrice(edition.priceCents, edition.currency)}
                      </b>
                    </td>
                    <td className="r">
                      {free && paid(product) ? (
                        freeAction(bought(product, product.entitlementIds.some((id) => entitlements[id] === "owned")))
                      ) : product.entitlementIds.some((id) => entitlements[id] === "owned") ? (
                        <span className="owned">Owned</span>
                      ) : (
                        <button type="button" className="btn sm p" onClick={() => onBuy(product)}>
                          Buy
                        </button>
                      )}
                    </td>
                  </tr>
                ) : null,
              )}
            </tbody>
          </table>
        </>
      ) : null}

      {catalog.subscriptionsAvailable && catalog.subscriptions.length > 0 ? (
        <>
          <h2>Support the studio</h2>
          <table>
            <thead>
              <tr>
                <th>Tier</th>
                <th>What it gives</th>
                <th className="r">Price</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {catalog.subscriptions.map((tier) => (
                <tr key={tier.id}>
                  <td>
                    <b>{tier.name}</b>
                  </td>
                  <td className="wrap">
                    {tierDescription(tier, catalog)}
                  </td>
                  <td className="r">{tierPrice(tier)}</td>
                  <td className="r">
                    <button
                      type="button"
                      className="btn sm"
                      onClick={() => onOpenUrl("https://lakesidegames.net/account")}
                    >
                      Subscribe
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {catalog.tiersNote ? <p className="muted small">{catalog.tiersNote}</p> : null}
        </>
      ) : null}
    </section>
  );
}
