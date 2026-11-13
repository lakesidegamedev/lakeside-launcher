import { formatPrice, type Entitlements, type Product } from "../catalog";
import {
  addOnRows,
  addonsFor,
  findLive,
  grantName,
  ownedLabel,
  priceSummary,
  tierPrice,
  type LiveCatalog,
} from "../lib/liveCatalog";
import { Thumb } from "./Thumb";

interface Props {
  catalog: LiveCatalog | null;
  /** False when this is the bundled copy because the live one could not be read. */
  live: boolean;
  entitlements: Entitlements;
  products: readonly Product[];
  signedIn: boolean;
  onBuy: (product: Product) => void;
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
  products,
  signedIn,
  onBuy,
  onOpenUrl,
  onOpenGame,
  onRefresh,
}: Props): JSX.Element {
  if (!catalog) return <div className="loading">Loading the store...</div>;

  const addonItems = products.flatMap((product) =>
    addOnRows(addonsFor(product, catalog), entitlements).map((row) => ({ product, row })),
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
        <span className="muted">Buy once, keep it on your Lakeside account.</span>
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
                  <b>{priceSummary(product, catalog, entitlements)}</b>
                </td>
                <td>
                  {owned === "owned" ? (
                    <span className="owned">Owned</span>
                  ) : owned === "free" ? (
                    <span className="tag">Free</span>
                  ) : null}
                </td>
                <td className="r">
                  {owned === "buy" ? (
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
                    <b>{row.priceText}</b>
                  </td>
                  <td className="r">
                    {row.owned ? (
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
                    <td className="wrap">Yours to keep, or included with a supporter tier</td>
                    <td className="r">
                      <b>{formatPrice(edition.priceCents, edition.currency)}</b>
                    </td>
                    <td className="r">
                      {product.entitlementIds.some((id) => entitlements[id] === "owned") ? (
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
                <th>Includes while subscribed</th>
                <th className="r">Price</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {catalog.subscriptions.map((tier, index) => (
                <tr key={tier.id}>
                  <td>
                    <b>{tier.name}</b>
                  </td>
                  <td className="wrap">
                    {tier.grants.map((grant) => grantName(grant, catalog)).join(", ")}
                  </td>
                  <td className="r">{tierPrice(tier)}</td>
                  <td className="r">
                    <button
                      type="button"
                      className={index === catalog.subscriptions.length - 1 ? "btn sm p" : "btn sm"}
                      onClick={() => onOpenUrl("https://lakesidegames.net/account")}
                    >
                      Subscribe
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
    </section>
  );
}
