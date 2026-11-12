import markUrl from "../assets/lakeside-mark.svg";
import type { Session } from "../platform/client";
import type { View } from "../App";

interface Props {
  view: View;
  onView: (view: View) => void;
  session: Session | null;
  libraryCount: number;
  storeCount: number;
  mode: "demo" | "live";
  onSignIn: () => void;
}

const ITEMS: readonly { id: View; label: string; hint: string }[] = [
  { id: "library", label: "Library", hint: "Games you own" },
  { id: "store", label: "Store", hint: "Games and packs" },
  { id: "account", label: "Account", hint: "Purchases and devices" },
];

export function Sidebar({
  view,
  onView,
  session,
  libraryCount,
  storeCount,
  mode,
  onSignIn,
}: Props): JSX.Element {
  const counts: Record<View, number | null> = {
    library: libraryCount,
    store: storeCount,
    account: null,
  };

  return (
    <aside className="sidebar">
      <div className="brand">
        <img src={markUrl} alt="" width={34} height={34} />
        <div>
          <strong>Lakeside</strong>
          <span>Games launcher</span>
        </div>
      </div>

      <nav className="nav" aria-label="Sections">
        {ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={view === item.id ? "nav-item is-active" : "nav-item"}
            onClick={() => onView(item.id)}
            aria-current={view === item.id ? "page" : undefined}
          >
            <span className="nav-label">{item.label}</span>
            {counts[item.id] !== null ? <span className="nav-count">{counts[item.id]}</span> : null}
            <small>{item.hint}</small>
          </button>
        ))}
      </nav>

      <div className="sidebar-foot">
        {session ? (
          <button type="button" className="account-chip" onClick={() => onView("account")}>
            <span className="avatar" aria-hidden="true">
              {session.username.slice(0, 1).toUpperCase()}
            </span>
            <span className="account-copy">
              <strong>{session.username}</strong>
              <small>{session.provider === "demo" ? "Demo session" : session.provider.toUpperCase()}</small>
            </span>
          </button>
        ) : (
          <button type="button" className="btn primary wide" onClick={onSignIn}>
            Sign in
          </button>
        )}
        <p className="mode-note">
          {mode === "demo"
            ? "Demo data. Purchases and sessions are local only."
            : "Connected to the Lakeside platform."}
        </p>
      </div>
    </aside>
  );
}
