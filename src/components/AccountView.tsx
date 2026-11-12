import { CATALOG, formatPrice, type Entitlements } from "../catalog";
import type { Session } from "../platform/client";
import type { ReleaseProduct } from "../lib/tauri";

interface Props {
  session: Session | null;
  entitlements: Entitlements;
  mode: "demo" | "live";
  releases: Record<string, ReleaseProduct>;
  onSignIn: () => void;
  onSignOut: () => void;
  onRefresh: () => void;
}

export function AccountView({
  session,
  entitlements,
  mode,
  releases,
  onSignIn,
  onSignOut,
  onRefresh,
}: Props): JSX.Element {
  const purchases = CATALOG.filter(
    (product) => product.productId !== null && entitlements[product.productId] !== undefined,
  );

  return (
    <section className="view account">
      <div className="account-grid">
        <article className="panel account-panel">
          <h2 className="section-title">Session</h2>
          {session ? (
            <>
              <div className="identity">
                <span className="avatar large" aria-hidden="true">
                  {session.username.slice(0, 1).toUpperCase()}
                </span>
                <div>
                  <strong>{session.username}</strong>
                  <p>{session.email ?? "No email on this provider"}</p>
                  <span className="badge">{session.provider.toUpperCase()}</span>
                </div>
              </div>
              <div className="panel-actions">
                <button type="button" className="btn ghost" onClick={onRefresh}>
                  Refresh purchases
                </button>
                <button type="button" className="btn danger" onClick={onSignOut}>
                  Sign out
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="panel-copy">
                Sign in with your Lakeside account to load the games and packs attached to it.
                The launcher never handles card details; checkout opens in your browser.
              </p>
              <button type="button" className="btn primary" onClick={onSignIn}>
                Sign in
              </button>
            </>
          )}
        </article>

        <article className="panel account-panel">
          <h2 className="section-title">Purchases</h2>
          {purchases.length === 0 ? (
            <p className="panel-copy">No purchases on this account yet.</p>
          ) : (
            <ul className="purchase-list">
              {purchases.map((product) => {
                const productId = product.productId;
                if (!productId) return null;
                const state = entitlements[productId];
                return (
                  <li key={product.id}>
                    <span className="purchase-mark" style={{ background: product.accent }}>
                      {product.mark}
                    </span>
                    <span className="purchase-copy">
                      <strong>{product.title}</strong>
                      <small>
                        {product.priceCents === null
                          ? "Free"
                          : formatPrice(product.priceCents, product.currency)}{" "}
                        · {productId}
                      </small>
                    </span>
                    <span className={state === "owned" ? "badge owned" : "badge"}>
                      {state === "owned" ? "Owned" : state}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </article>

        <article className="panel account-panel">
          <h2 className="section-title">Devices</h2>
          <p className="panel-copy">
            Device management is not built yet. The launcher holds one local session per
            machine, stored outside the webview.
          </p>
          <ul className="device-list">
            <li>
              <span>
                <strong>This device</strong>
                <small>Windows, macOS or Linux</small>
              </span>
              <span className="badge owned">Active</span>
            </li>
          </ul>
        </article>

        <article className="panel account-panel">
          <h2 className="section-title">Release channel</h2>
          {Object.keys(releases).length === 0 ? (
            <p className="panel-copy">
              Release metadata is unavailable right now. Installed games still launch and the
              launcher still updates itself.
            </p>
          ) : (
            <ul className="purchase-list">
              {Object.entries(releases).map(([id, release]) => (
                <li key={id}>
                  <span className="purchase-mark" style={{ background: "#2f7f7a" }}>
                    {release.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="purchase-copy">
                    <strong>{release.name}</strong>
                    <small>
                      {release.version} · {Object.keys(release.artifacts).length} builds · signed
                    </small>
                  </span>
                  <span className="badge owned">Verified</span>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="panel account-panel">
          <h2 className="section-title">Platform mode</h2>
          <p className="panel-copy">
            {mode === "demo"
              ? "Demo mode: sessions and entitlements are simulated locally. Desktop builds default to live; set VITE_PLATFORM_MODE=demo only for a demo build."
              : "Live mode: identity comes from lakeside-auth and purchases from lakeside-accounts. If the platform is unreachable the launcher boots from its last known library."}
          </p>
        </article>
      </div>
    </section>
  );
}
