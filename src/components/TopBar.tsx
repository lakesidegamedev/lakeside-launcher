import markUrl from "../assets/lakeside-mark.svg";

export type View = "library" | "store" | "downloads" | "account";

interface Props {
  view: View;
  onView: (view: View) => void;
  downloadCount: number;
  /** Signed-in name, or null when signed out. */
  accountName: string | null;
  onAccount: () => void;
}

const TABS: ReadonlyArray<{ id: Exclude<View, "account">; label: string }> = [
  { id: "library", label: "Library" },
  { id: "store", label: "Store" },
  { id: "downloads", label: "Downloads" },
];

export function TopBar({ view, onView, downloadCount, accountName, onAccount }: Props): JSX.Element {
  return (
    <header className="top">
      <div className="brand">
        <img src={markUrl} alt="" />
        Lakeside Games
      </div>
      <nav className="tabs" aria-label="Launcher">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={view === tab.id ? "tab on" : "tab"}
            aria-current={view === tab.id ? "page" : undefined}
            onClick={() => onView(tab.id)}
          >
            {tab.label}
            {tab.id === "downloads" && downloadCount > 0 ? (
              <span className="n">{downloadCount}</span>
            ) : null}
          </button>
        ))}
      </nav>
      <button
        type="button"
        className={accountName ? (view === "account" ? "acct on" : "acct") : "acct out"}
        onClick={onAccount}
      >
        {accountName ? (
          <>
            <span className="av" aria-hidden="true">
              {accountName.slice(0, 1).toUpperCase()}
            </span>
            <span className="acct-name">{accountName}</span>
          </>
        ) : (
          "Sign in"
        )}
      </button>
    </header>
  );
}
