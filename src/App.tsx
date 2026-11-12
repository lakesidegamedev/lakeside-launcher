import { useEffect, useState } from "react";
import {
  CATALOG,
  canLaunchDesktop,
  executableFor,
  installerSupported,
  libraryProducts,
  storeProducts,
  type Entitlements,
  type Platform,
  type Product,
} from "./catalog";
import { createPlatformClient, type Session } from "./platform/client";
import {
  beginSignIn,
  isDesktop,
  launchProduct,
  onSignInCode,
  openExternal,
  openWebGame,
  getReleaseManifest,
  installRelease,
  installedProducts,
  onInstallProgress,
  type InstallProgress,
  type InstalledProduct,
  type ReleaseArtifact,
  type ReleaseProduct,
} from "./lib/tauri";
import type { ChipTone } from "./components/GameCard";
import { Sidebar } from "./components/Sidebar";
import { LibraryView } from "./components/LibraryView";
import { StoreView } from "./components/StoreView";
import { AccountView } from "./components/AccountView";
import { ProductDetail } from "./components/ProductDetail";
import { checkForUpdate, installUpdate, type UpdateInfo } from "./lib/updater";
import { isNewerVersion } from "./lib/version";

export type View = "library" | "store" | "account";

const VIEW_COPY: Record<View, { title: string; subtitle: string }> = {
  library: { title: "Library", subtitle: "Your games, ready when you are" },
  store: { title: "Store", subtitle: "Games and campaign packs for your account" },
  account: { title: "Settings", subtitle: "Session, purchases and devices" },
};

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return "android";
  if (/Windows/i.test(ua)) return "windows";
  if (/Mac OS X|Macintosh/i.test(ua)) return "macos";
  if (/Linux|X11/i.test(ua)) return "linux";
  return "browser";
}

export function App(): JSX.Element {
  const [client] = useState(createPlatformClient);
  const [session, setSession] = useState<Session | null>(null);
  const [entitlements, setEntitlements] = useState<Entitlements>({});
  const [view, setView] = useState<View>("library");
  const [selected, setSelected] = useState<Product | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateProgress, setUpdateProgress] = useState<number | null>(null);
  const [updating, setUpdating] = useState(false);
  const [releases, setReleases] = useState<Record<string, ReleaseProduct>>({});
  const [installed, setInstalled] = useState<Record<string, InstalledProduct>>({});
  const [installing, setInstalling] = useState<string | null>(null);
  const [installFraction, setInstallFraction] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [nextSession, nextEntitlements] = await Promise.all([
        client.getSession(),
        client.getEntitlements(),
      ]);
      if (cancelled) return;
      setSession(nextSession);
      setEntitlements(nextEntitlements);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [client]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 7000);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!isDesktop()) return;
    let cancelled = false;
    void checkForUpdate()
      .then((info) => {
        if (!cancelled && info) setUpdateInfo(info);
      })
      .catch(() => {
        // Offline or the feed is unreachable: stay quiet on startup.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isDesktop()) return;
    let cancelled = false;
    void getReleaseManifest()
      .then((manifest) => {
        if (!cancelled) setReleases(manifest.products);
      })
      .catch(() => {
        // The library still works without release metadata.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isDesktop()) return;
    let cancelled = false;
    void installedProducts()
      .then((next) => {
        if (!cancelled) setInstalled(next);
      })
      .catch(() => {
        // Installed games simply show as not installed.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isDesktop()) return;
    let unlisten: (() => void) | null = null;
    void onInstallProgress((progress: InstallProgress) => {
      if (progress.total && progress.total > 0) {
        setInstallFraction(Math.min(progress.downloaded / progress.total, 1));
      }
    }).then((stop) => {
      unlisten = stop;
    });
    return () => {
      unlisten?.();
    };
  }, []);

  const library = libraryProducts(entitlements);
  const store = storeProducts(entitlements);

  async function refreshEntitlements(): Promise<void> {
    const next = await client.getEntitlements();
    setEntitlements(next);
  }

  async function handleSignIn(): Promise<void> {
    if (client.mode === "demo") {
      const next = await client.exchange("demo");
      setSession(next);
      await refreshEntitlements();
      setNotice("Signed in to a local demo session. Purchases are simulated.");
      return;
    }

    try {
      const start = await beginSignIn();
      let stop: (() => void) | null = null;
      stop = await onSignInCode(async (code) => {
        stop?.();
        try {
          const next = await client.exchange(code);
          setSession(next);
          await refreshEntitlements();
          setNotice(`Signed in as ${next.username}.`);
        } catch (error) {
          setNotice(message(error));
        }
      });
      // Discord is the launcher's primary provider in Phase 0: the AHD cookie
      // is scoped to ahousedividedgame.com and needs the sibling auth ingress.
      await openExternal(
        `https://auth.lakesidegames.net/auth/discord?return=${encodeURIComponent(start.returnUrl)}`,
      );
      setNotice("Finish signing in in your browser, then return to the launcher.");
    } catch (error) {
      setNotice(message(error));
    }
  }

  async function handleSignOut(): Promise<void> {
    await client.signOut();
    setSession(null);
    setEntitlements({});
    setSelected(null);
    setNotice("Signed out.");
  }

  async function handleInstallUpdate(): Promise<void> {
    setUpdating(true);
    setUpdateProgress(null);
    try {
      await installUpdate(setUpdateProgress);
      // relaunch() replaces the process; reaching here means it returned.
      setUpdating(false);
    } catch (error) {
      setNotice(message(error));
      setUpdating(false);
    }
  }

  function artifactFor(product: Product): ReleaseArtifact | null {
    const release = releases[product.id];
    if (!release) return null;
    const platform = detectPlatform();
    const key =
      platform === "windows"
        ? "windows-x64"
        : platform === "linux"
          ? "linux-x64"
          : platform === "macos"
            ? "macos-arm64"
            : platform === "android"
              ? "android"
              : null;
    return key ? (release.artifacts[key] ?? null) : null;
  }

  function canInstall(product: Product): boolean {
    if (!isDesktop() || product.delivery !== "native") return false;
    const artifact = artifactFor(product);
    if (!artifact?.sha256) return false;
    return installerSupported(artifact.kind, detectPlatform());
  }

  function latestVersion(product: Product): string | null {
    return releases[product.id]?.version ?? null;
  }

  function hasUpdate(product: Product): boolean {
    const latest = latestVersion(product);
    const current = installed[product.id]?.version ?? null;
    return !!latest && isNewerVersion(latest, current);
  }

  async function handleInstall(product: Product): Promise<void> {
    const release = releases[product.id];
    const artifact = artifactFor(product);
    if (!release || !artifact || !artifact.sha256) {
      setNotice("No verified installer is published for this platform yet.");
      return;
    }

    setInstalling(product.id);
    setInstallFraction(null);
    try {
      const result = await installRelease({
        productId: product.id,
        version: release.version,
        url: artifact.url,
        sha256: artifact.sha256,
        fileName: artifact.name,
        kind: artifact.kind,
        commercialId: product.authenticatedDownload ? (product.productId ?? undefined) : undefined,
      });
      setInstalled((previous) => ({
        ...previous,
        [product.id]: {
          version: result.version,
          executable: result.executable,
          installedAt: Date.now(),
        },
      }));
      setNotice(`Installed ${product.title} ${result.version}.`);
    } catch (error) {
      setNotice(message(error));
    } finally {
      setInstalling(null);
      setInstallFraction(null);
    }
  }

  async function handleLaunch(product: Product): Promise<void> {
    const platform = detectPlatform();
    const executable = executableFor(product, platform);
    if (!executable) {
      setNotice(`No ${platform} build is configured for ${product.title}.`);
      return;
    }
    if (!isDesktop()) {
      setNotice("Launching installed games needs the desktop launcher. Use Play online in this preview.");
      return;
    }
    setBusy(product.id);
    try {
      await launchProduct(product.id, executable, product.handoffClientId);
      setNotice(`Launched ${product.title}.`);
    } catch (error) {
      setNotice(message(error));
    } finally {
      setBusy(null);
    }
  }

  async function handleWeb(product: Product): Promise<void> {
    if (!product.webUrl) return;
    try {
      if (isDesktop()) {
        await openWebGame(product.id, product.webUrl, product.title);
      } else {
        window.open(product.webUrl, "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      setNotice(message(error));
    }
  }

  function handleBuy(product: Product): void {
    if (!product.productId) return;
    const url = `https://lakesidegames.net/account/checkout?product=${encodeURIComponent(product.productId)}`;
    if (isDesktop()) {
      void openExternal(url).then(
        () => setNotice("Checkout opened in your browser. Refresh purchases when you are done."),
        (error: unknown) => setNotice(message(error)),
      );
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  function handlePrimary(product: Product): void {
    if (product.delivery === "web") {
      void handleWeb(product);
      return;
    }
    if (product.delivery === "native") {
      if (canLaunchDesktop(product, entitlements)) {
        if (!installed[product.id] && canInstall(product)) {
          void handleInstall(product);
        } else if (installed[product.id] && hasUpdate(product) && canInstall(product)) {
          void handleInstall(product);
        } else {
          void handleLaunch(product);
        }
      } else if (product.webUrl) {
        void handleWeb(product);
      } else if (product.priceCents !== null) {
        handleBuy(product);
      }
    }
  }

  function primaryLabel(product: Product): string {
    if (product.status === "soon") return "Coming soon";
    if (product.delivery === "web") return "Play in browser";
    if (canLaunchDesktop(product, entitlements)) {
      if (installing === product.id) {
        return installFraction === null
          ? "Installing..."
          : `Installing ${Math.round(installFraction * 100)}%`;
      }
      if (installed[product.id]) {
        return hasUpdate(product) ? `Update to ${latestVersion(product)}` : "Launch desktop";
      }
      if (canInstall(product)) {
        const version = latestVersion(product);
        return version ? `Install ${version}` : "Install";
      }
      return "Launch desktop";
    }
    if (product.webUrl) return "Play online";
    if (product.priceCents !== null) return "Buy";
    return "Unavailable";
  }

  function chipFor(product: Product): { label: string; tone: ChipTone } {
    if (product.status === "soon") return { label: "Coming soon", tone: "muted" };
    if (product.delivery === "web") return { label: "Web", tone: "info" };
    const version = installed[product.id]?.version;
    if (version) {
      return hasUpdate(product)
        ? { label: "Update available", tone: "warn" }
        : { label: `Installed ${version}`, tone: "ok" };
    }
    if (canLaunchDesktop(product, entitlements) && canInstall(product)) {
      return { label: "Not installed", tone: "muted" };
    }
    if (product.webUrl) return { label: "Web", tone: "info" };
    return { label: "Not installed", tone: "muted" };
  }

  const copy = VIEW_COPY[view];

  return (
    <div className={selected && view !== "account" ? "app-shell has-detail" : "app-shell"}>
      <Sidebar
        view={view}
        onView={setView}
        session={session}
        libraryCount={library.length}
        storeCount={store.length}
        mode={client.mode}
        onSignIn={() => void handleSignIn()}
      />

      <main className="main">
        <header className="topbar">
          <h1>{copy.title}</h1>
          <p>{copy.subtitle}</p>
          <span className={`mode-pill ${client.mode}`}>
            {client.mode === "demo" ? "Demo library" : "Live account"}
          </span>
        </header>

        {updateInfo ? (
          <div className="update-bar" role="status">
            <div className="update-copy">
              <strong>Lakeside {updateInfo.version} is available</strong>
              <span>{updateInfo.notes || "A new launcher build is ready to install."}</span>
            </div>
            <div className="update-actions">
              <button
                type="button"
                className="btn small primary"
                onClick={() => void handleInstallUpdate()}
                disabled={updating}
              >
                {updating
                  ? updateProgress === null
                    ? "Downloading..."
                    : `Installing ${Math.round(updateProgress * 100)}%`
                  : "Update and restart"}
              </button>
              <button
                type="button"
                className="btn small ghost"
                onClick={() => setUpdateInfo(null)}
                disabled={updating}
              >
                Later
              </button>
            </div>
          </div>
        ) : null}

        {!ready ? (
          <div className="loading">Loading your library...</div>
        ) : view === "library" ? (
          <LibraryView
            products={library}
            entitlements={entitlements}
            busy={installing ?? busy}
            onSelect={setSelected}
            onPrimary={handlePrimary}
            onWeb={(product) => void handleWeb(product)}
            primaryLabel={primaryLabel}
            chipFor={chipFor}
            selectedId={selected?.id ?? null}
            signedIn={session !== null}
            onSignIn={() => void handleSignIn()}
            onBrowseStore={() => setView("store")}
          />
        ) : view === "store" ? (
          <StoreView
            products={store}
            entitlements={entitlements}
            selectedId={selected?.id ?? null}
            onSelect={setSelected}
            onBuy={handleBuy}
            signedIn={session !== null}
            onSignIn={() => void handleSignIn()}
          />
        ) : (
          <AccountView
            session={session}
            entitlements={entitlements}
            mode={client.mode}
            releases={releases}
            onSignIn={() => void handleSignIn()}
            onSignOut={() => void handleSignOut()}
            onRefresh={() =>
              void refreshEntitlements().then(
                () => setNotice("Purchases refreshed."),
                (error: unknown) => setNotice(message(error)),
              )
            }
          />
        )}
      </main>

      {selected && view !== "account" ? (
        <ProductDetail
          product={selected}
          entitlements={entitlements}
          release={releases[selected.id] ?? null}
          installedVersion={installed[selected.id]?.version ?? null}
          updateAvailable={hasUpdate(selected)}
          installing={installing === selected.id}
          installFraction={installFraction}
          canInstall={canInstall(selected)}
          busy={busy === selected.id}
          onClose={() => setSelected(null)}
          onLaunch={() => void handleLaunch(selected)}
          onInstall={() => void handleInstall(selected)}
          onWeb={() => void handleWeb(selected)}
          onBuy={() => handleBuy(selected)}
        />
      ) : null}

      {notice ? (
        <div className="toast" role="status">
          {notice}
        </div>
      ) : null}

      <footer className="status-line">
        {CATALOG.length} products · {isDesktop() ? "desktop shell" : "browser preview"}
      </footer>
    </div>
  );
}
