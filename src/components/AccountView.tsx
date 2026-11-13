import { CATALOG } from "../catalog";
import type { Entitlements } from "../catalog";
import type { Session } from "../platform/client";
import type { SignInProvider } from "../lib/signin";
import { tierDescription, tierPrice, type LiveCatalog } from "../lib/liveCatalog";

interface Props {
  session: Session | null;
  entitlements: Entitlements;
  catalog: LiveCatalog | null;
  accountUrl: string;
  onSignIn: (provider: SignInProvider) => void;
  onSignOut: () => void;
  onOpenUrl: (url: string) => void;
  onRefresh: () => void;
}

const PROVIDER_NAMES: Record<string, string> = {
  ahd: "Lakeside Games",
  discord: "Discord",
  demo: "a local demo account",
};

export function AccountView({
  session,
  entitlements,
  catalog,
  accountUrl,
  onSignIn,
  onSignOut,
  onOpenUrl,
  onRefresh,
}: Props): JSX.Element {
  if (!session) {
    return (
      <section>
        <div className="head">
          <h1>Account</h1>
        </div>
        <div className="panel" style={{ maxWidth: 420 }}>
          <h3>You are not signed in</h3>
          <div className="sub" style={{ marginBottom: 10 }}>
            Sign in to load your purchases and supporter benefits.
          </div>
          <button type="button" className="btn p" onClick={() => onSignIn("ahd")}>
            Sign in with Lakeside Games
          </button>{" "}
          <button type="button" className="btn" onClick={() => onSignIn("discord")}>
            Discord
          </button>
        </div>
      </section>
    );
  }

  // Everything the platform says is owned, named from the live catalog.
  const owned = Object.entries(entitlements)
    .filter(([, state]) => state === "owned")
    .map(([id]) => {
      const game = CATALOG.find((product) => product.entitlementIds.includes(id));
      const live = catalog?.products.find((product) => product.id === id) ?? null;
      return { id, name: live?.name ?? game?.title ?? id, game: game?.title ?? null };
    });
  const providerName = PROVIDER_NAMES[session.provider] ?? session.provider;
  const tiers = catalog?.subscriptions ?? [];

  return (
    <section>
      <div className="head">
        <h1>Account</h1>
        <div className="sp">
          <button type="button" className="btn sm" onClick={onRefresh}>
            Refresh purchases
          </button>
          <button type="button" className="btn sm" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </div>
      <div className="two wide">
        <div>
          <div className="panel idrow">
            <span className="av big" aria-hidden="true">
              {session.username.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <div className="name">{session.username}</div>
              <div className="muted">
                Signed in with {providerName}
                {session.email ? `. ${session.email}` : ""}
              </div>
            </div>
          </div>

          <h2>Sign-in methods</h2>
          <table>
            <tbody>
              <tr>
                <td>
                  <b>{providerName}</b>
                </td>
                <td>
                  <span className="owned">Connected</span>
                </td>
                <td className="r muted">This session</td>
              </tr>
              <tr>
                <td colSpan={2} className="wrap muted">
                  Connect or disconnect other sign-in methods on your account page.
                </td>
                <td className="r">
                  <button type="button" className="btn sm" onClick={() => onOpenUrl(accountUrl)}>
                    Manage
                  </button>
                </td>
              </tr>
            </tbody>
          </table>

          <h2>Purchases</h2>
          {owned.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Game</th>
                  <th className="r">Receipt</th>
                </tr>
              </thead>
              <tbody>
                {owned.map((item) => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td className="muted">{item.game ?? ""}</td>
                    <td className="r">
                      <button type="button" className="btn sm" onClick={() => onOpenUrl(accountUrl)}>
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty">No purchases on this account yet.</div>
          )}
        </div>
        <aside>
          {tiers.length > 0 && catalog ? (
            tiers.map((tier) => (
              <div className="panel" key={tier.id} style={{ marginBottom: 12 }}>
                <h3>{tier.name}</h3>
                <div className="sub" style={{ marginBottom: 8 }}>
                  {tierPrice(tier)}
                </div>
                <p className="sub">{tierDescription(tier, catalog)}</p>
              </div>
            ))
          ) : null}
          <div className="btnrow" style={{ marginBottom: 12 }}>
            <button
              type="button"
              className="btn sm"
              onClick={() => onOpenUrl("https://lakesidegames.net/account/subscription/manage")}
            >
              Manage subscription
            </button>
          </div>
          <div className="note">
            Cancel any time. Installed games keep working offline. Refunds within 14 days.
          </div>
        </aside>
      </div>
    </section>
  );
}
