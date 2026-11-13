import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CATALOG,
  PRODUCTS_BY_ID,
  canLaunchDesktop,
  executableFor,
  installerSupported,
  libraryProducts,
  type Entitlements,
  type Platform,
  type Product,
} from "./catalog";
import { createPlatformClient, type Session } from "./platform/client";
import { buildSignInUrl, type SignInProvider } from "./lib/signin";
import {
  beginSignIn,
  getAccountRelease,
  getCapabilities,
  getPatchNotes,
  getReleaseManifest,
  installDetails,
  installRelease,
  installedProducts,
  isDesktop,
  launchDesktopApp,
  launchProduct,
  detectDesktopApp,
  onInstallProgress,
  onSignInCode,
  openExternal,
  openInstallFolder,
  openWebGame,
  repairInstall,
  uninstallProduct,
  type Capability,
  type InstallDetails,
  type InstalledProduct,
  type PatchNote,
  type ReleaseArtifact,
  type ReleaseProduct,
} from "./lib/tauri";
import { checkForUpdate, installUpdate, type UpdateInfo } from "./lib/updater";
import { isNewerVersion } from "./lib/version";
import { gameAction, gameState } from "./lib/state";
import { loadCatalog, findLive, type CatalogResult } from "./lib/liveCatalog";
import { formatBytes } from "./lib/format";
import { formatPrice } from "./catalog";
import {
  activeDownloads,
  applyProgress,
  newDownload,
  nextToStart,
  type DownloadItem,
} from "./lib/downloads";
import { DEMO_DOWNLOADS, DEMO_INSTALLED, DEMO_NOTES, DEMO_RELEASES } from "./lib/demo";
import type { GameRow } from "./lib/rows";
import { TopBar, type View } from "./components/TopBar";
import { LibraryView } from "./components/LibraryView";
import { GameView } from "./components/GameView";
import { StoreView } from "./components/StoreView";
import { DownloadsView } from "./components/DownloadsView";
import { AccountView } from "./components/AccountView";
import { SignInView } from "./components/SignInView";
import { StatusBar } from "./components/StatusBar";

const GUEST_KEY = "lakeside.launcher.guest";
const ACCOUNT_URL = "https://lakesidegames.net/account";

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
  const demo = client.mode === "demo" && !isDesktop();
  const platform = useMemo(detectPlatform, []);

  const [session, setSession] = useState<Session | null>(null);
  const [entitlements, setEntitlements] = useState<Entitlements>({});
  const [view, setView] = useState<View>("library");
  const [gameId, setGameId] = useState<string | null>(null);
  const [guest, setGuest] = useState(() => {
    try {
      return localStorage.getItem(GUEST_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateProgress, setUpdateProgress] = useState<number | null>(null);
  const [updating, setUpdating] = useState(false);
  const [releases, setReleases] = useState<Record<string, ReleaseProduct>>(
    demo ? DEMO_RELEASES : {},
  );
  const [installed, setInstalled] = useState<Record<string, InstalledProduct>>(
    demo ? DEMO_INSTALLED : {},
  );
  // Paid products whose release lookup finished, so "Coming tonight" only
  // shows once the accounts service actually said nothing is published.
  const [releaseChecked, setReleaseChecked] = useState<Record<string, boolean>>({});
  const [downloads, setDownloads] = useState<DownloadItem[]>(demo ? DEMO_DOWNLOADS : []);
  const [catalogResult, setCatalogResult] = useState<CatalogResult | null>(null);
  const [capabilities, setCapabilities] = useState<ReadonlySet<Capability>>(new Set());
  const [notes, setNotes] = useState<Record<string, PatchNote[]>>(demo ? DEMO_NOTES : {});
  const [details, setDetails] = useState<Record<string, InstallDetails>>({});

  // Session and purchases.
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

  // The live store catalog.
  useEffect(() => {
    let cancelled = false;
    void loadCatalog().then((result) => {
      if (!cancelled) setCatalogResult(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
    void getCapabilities().then((next) => {
      if (!cancelled) setCapabilities(next);
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
        if (cancelled) return;
        // Paid builds are described by the accounts service, never by the
        // public manifest.
        const publicProducts = { ...manifest.products };
        for (const product of CATALOG) {
          if (product.authenticatedDownload) delete publicProducts[product.id];
        }
        setReleases((previous) => {
          const paid: Record<string, ReleaseProduct> = {};
          for (const product of CATALOG) {
            const existing = previous[product.id];
            if (product.authenticatedDownload && existing) paid[product.id] = existing;
          }
          return { ...publicProducts, ...paid };
        });
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

  const signedInUser = session?.username ?? null;
  useEffect(() => {
    if (!isDesktop()) return;
    let cancelled = false;
    const paid = CATALOG.filter((product) => product.authenticatedDownload && product.entitlementIds[0]);
    if (!signedInUser) {
      setReleaseChecked({});
      setReleases((previous) => {
        const next = { ...previous };
        for (const product of paid) delete next[product.id];
        return next;
      });
      return;
    }
    for (const product of paid) {
      void getAccountRelease(product.entitlementIds[0] as string)
        .catch(() => null)
        .then((release) => {
          if (cancelled) return;
          setReleases((previous) => {
            const next = { ...previous };
            if (release) next[product.id] = release;
            else delete next[product.id];
            return next;
          });
          setReleaseChecked((previous) => ({ ...previous, [product.id]: true }));
        });
    }
    return () => {
      cancelled = true;
    };
  }, [signedInUser]);

  useEffect(() => {
    if (!isDesktop() || platform !== "windows") return;
    let cancelled = false;
    for (const product of CATALOG.filter((entry) => entry.registryApp)) {
      void detectDesktopApp(product.id).then((app) => {
        if (cancelled || !app) return;
        setInstalled((previous) => ({
          ...previous,
          [product.id]: {
            version: app.version,
            executable: app.installLocation,
            installedAt: 0,
          },
        }));
      });
    }
    return () => {
      cancelled = true;
    };
  }, [platform]);

  // Real progress from the install events, folded into the queue.
  useEffect(() => {
    if (!isDesktop()) return;
    let unlisten: (() => void) | null = null;
    void onInstallProgress((progress) => {
      const now = Date.now();
      setDownloads((previous) =>
        previous.map((item) =>
          item.id === progress.productId && item.status === "running"
            ? applyProgress(item, progress.downloaded, progress.total, now)
            : item,
        ),
      );
    }).then((stop) => {
      unlisten = stop;
    });
    return () => {
      unlisten?.();
    };
  }, []);

  // Details about each installed game, when this build of the shell can report them.
  useEffect(() => {
    if (!capabilities.has("install_details")) return;
    let cancelled = false;
    for (const id of Object.keys(installed)) {
      void installDetails(id)
        .then((next) => {
          if (!cancelled) setDetails((previous) => ({ ...previous, [id]: next }));
        })
        .catch(() => {
          // Leave the details blank rather than guess.
        });
    }
    return () => {
      cancelled = true;
    };
  }, [capabilities, installed]);

  // Patch notes for the open game page: the latest three, from its release notes.
  const selectedDesktopId = gameId
    ? (PRODUCTS_BY_ID.get(gameId)?.companion ?? gameId)
    : null;
  const notesUrl = selectedDesktopId ? (releases[selectedDesktopId]?.notesUrl ?? null) : null;
  useEffect(() => {
    if (!selectedDesktopId || !notesUrl || !isDesktop() || notes[selectedDesktopId]) return;
    let cancelled = false;
    void getPatchNotes(notesUrl, 3)
      .then((list) => {
        if (!cancelled) setNotes((previous) => ({ ...previous, [selectedDesktopId]: list }));
      })
      .catch(() => {
        // No notes is fine: the section stays hidden.
      });
    return () => {
      cancelled = true;
    };
  }, [selectedDesktopId, notesUrl, notes]);

  const catalog = catalogResult?.catalog ?? null;
  const libraryIds = new Set(libraryProducts(entitlements).map((product) => product.id));

  async function refreshEntitlements(): Promise<void> {
    const next = await client.getEntitlements();
    setEntitlements(next);
  }

  async function handleSignIn(provider: SignInProvider): Promise<void> {
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
      await openExternal(buildSignInUrl(provider, start.port, start.state));
      setNotice("Finish signing in in your browser, then return to the launcher.");
    } catch (error) {
      setNotice(message(error));
    }
  }

  async function handleSignOut(): Promise<void> {
    await client.signOut();
    setSession(null);
    setEntitlements({});
    setGameId(null);
    setView("library");
    setNotice("Signed out.");
  }

  function continueAsGuest(): void {
    try {
      localStorage.setItem(GUEST_KEY, "1");
    } catch {
      // Not persisted; the sign-in page shows again next start.
    }
    setGuest(true);
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

  /** Paid build on a Mac with no disk image published yet: send the player to the account page. */
  function macBrowserDownload(product: Product): boolean {
    const artifact = artifactFor(product);
    return (
      platform === "macos" &&
      !!product.browserDownloadUrl &&
      canLaunchDesktop(product, entitlements) &&
      !(artifact?.sha256 && installerSupported(artifact.kind, "macos"))
    );
  }

  function canInstall(product: Product): boolean {
    if (!isDesktop() && !demo) return false;
    if (product.delivery !== "native") return false;
    if (macBrowserDownload(product)) return true;
    const artifact = artifactFor(product);
    // Registry-detected apps are installed by their own setup, opened from the download link.
    if (product.registryApp) return artifact !== null && platform === "windows";
    if (!artifact?.sha256) return false;
    return installerSupported(artifact.kind, platform);
  }

  /** Entitled paid product with nothing to install yet. */
  function comingTonight(product: Product): boolean {
    return (
      !!product.authenticatedDownload &&
      canLaunchDesktop(product, entitlements) &&
      !installed[product.id] &&
      !canInstall(product)
    );
  }

  function latestVersion(product: Product): string | null {
    return releases[product.id]?.version ?? null;
  }

  function hasUpdate(product: Product): boolean {
    const latest = latestVersion(product);
    const current = installed[product.id]?.version ?? null;
    return !!latest && isNewerVersion(latest, current);
  }

  function enqueueInstall(product: Product): void {
    const release = releases[product.id];
    if (!release || !artifactFor(product)?.sha256) {
      setNotice("No verified installer is published for this platform yet.");
      return;
    }
    const kind = installed[product.id] ? "update" : "install";
    setDownloads((previous) => {
      if (activeDownloads(previous).some((item) => item.id === product.id)) return previous;
      const rest = previous.filter((item) => item.id !== product.id);
      return [...rest, newDownload(product.id, product.title, kind, release.version)];
    });
  }

  async function handleInstall(product: Product): Promise<void> {
    const artifact = artifactFor(product);
    if (macBrowserDownload(product) && product.browserDownloadUrl) {
      try {
        await openExternal(product.browserDownloadUrl);
        setNotice(`Your ${product.title} download is on your account page.`);
      } catch (error) {
        setNotice(message(error));
      }
      return;
    }
    if (product.registryApp) {
      if (!artifact) return;
      try {
        await openExternal(artifact.url);
        setNotice(`Download for ${product.title} opened in your browser. Run the setup, then reopen the launcher.`);
      } catch (error) {
        setNotice(message(error));
      }
      return;
    }
    enqueueInstall(product);
  }

  // Run queued installs one at a time.
  const startId = nextToStart(downloads);
  useEffect(() => {
    if (!startId) return;
    const product = PRODUCTS_BY_ID.get(startId);
    const release = releases[startId];
    const artifact = product ? artifactFor(product) : null;
    if (!product || !release || !artifact?.sha256) {
      setDownloads((previous) =>
        previous.map((item) =>
          item.id === startId
            ? { ...item, status: "failed", error: "No verified installer is published.", finishedAt: Date.now() }
            : item,
        ),
      );
      return;
    }
    setDownloads((previous) =>
      previous.map((item) => (item.id === startId ? { ...item, status: "running" } : item)),
    );
    if (!isDesktop()) {
      // The browser preview has no installer; show the failure instead of hanging.
      setDownloads((previous) =>
        previous.map((item) =>
          item.id === startId
            ? { ...item, status: "failed", error: "Installing needs the desktop launcher.", finishedAt: Date.now() }
            : item,
        ),
      );
      return;
    }
    void installRelease({
      productId: product.id,
      version: release.version,
      url: artifact.url,
      sha256: artifact.sha256,
      fileName: artifact.name,
      kind: artifact.kind,
      commercialId: product.authenticatedDownload ? (product.entitlementIds[0] ?? undefined) : undefined,
    })
      .then((result) => {
        if (result.action === "opened") {
          // A Mac disk image was opened for the player to drag into Applications.
          setDownloads((previous) =>
            previous.map((item) =>
              item.id === startId ? { ...item, status: "done", finishedAt: Date.now() } : item,
            ),
          );
          setNotice(
            `Opened the ${product.title} disk image. Drag the app into Applications, then right-click it and choose Open the first time.`,
          );
          return;
        }
        setInstalled((previous) => ({
          ...previous,
          [product.id]: {
            version: result.version,
            executable: result.executable,
            installedAt: Date.now(),
          },
        }));
        setDownloads((previous) =>
          previous.map((item) =>
            item.id === startId ? { ...item, status: "done", finishedAt: Date.now() } : item,
          ),
        );
        setNotice(`Installed ${product.title} ${result.version}.`);
      })
      .catch((error: unknown) => {
        setDownloads((previous) =>
          previous.map((item) =>
            item.id === startId
              ? { ...item, status: "failed", error: message(error), finishedAt: Date.now() }
              : item,
          ),
        );
        setNotice(message(error));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startId]);

  async function handleLaunch(product: Product): Promise<void> {
    if (product.registryApp) {
      if (!isDesktop()) {
        setNotice("Launching installed apps needs the desktop launcher.");
        return;
      }
      setBusy(product.id);
      try {
        await launchDesktopApp(product.id, product.handoffClientId);
        setNotice(`Launched ${product.title}.`);
      } catch (error) {
        setNotice(message(error));
      } finally {
        setBusy(null);
      }
      return;
    }
    const executable = executableFor(product, platform);
    if (!executable) {
      setNotice(`No ${platform} build is configured for ${product.title}.`);
      return;
    }
    if (!isDesktop()) {
      setNotice("Launching installed games needs the desktop launcher. Use Play in browser in this preview.");
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

  const openUrl = useCallback((url: string, doneNotice?: string): void => {
    if (isDesktop()) {
      void openExternal(url).then(
        () => {
          if (doneNotice) setNotice(doneNotice);
        },
        (error: unknown) => setNotice(message(error)),
      );
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }, []);

  function handleBuy(product: Product): void {
    openUrl(product.storeUrl, "The store page opened in your browser. Refresh purchases when you are done.");
  }

  async function runBackend(label: string, action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (error) {
      setNotice(`${label}: ${message(error)}`);
    }
  }

  function rowFor(product: Product): GameRow {
    const desktopCandidate = product.companion
      ? (PRODUCTS_BY_ID.get(product.companion) ?? null)
      : product.delivery === "native"
        ? product
        : null;
    const desktop =
      desktopCandidate && desktopCandidate.platforms.includes(platform) ? desktopCandidate : null;
    const owned = desktop ? canLaunchDesktop(desktop, entitlements) : false;
    const installedVersion = desktop ? (installed[desktop.id]?.version ?? null) : null;
    const latest = desktop ? latestVersion(desktop) : null;
    const installable = desktop ? canInstall(desktop) : false;
    const updateAvailable = !!desktop && hasUpdate(desktop) && installable;
    const hasWeb = product.webUrl !== null;
    const stateInput = {
      owned,
      hasDesktop: desktop !== null,
      hasWeb,
      installedVersion,
      latestVersion: latest,
      updateAvailable,
      canInstall: installable,
      includedWith: null,
    };
    const installing = desktop ? activeDownloads(downloads).find((item) => item.id === desktop.id) : undefined;
    const fraction =
      installing && installing.total ? Math.min(installing.downloaded / installing.total, 1) : null;
    const canLaunch =
      !!desktop && (desktop.registryApp === true || executableFor(desktop, platform) !== null);
    const live = catalog ? findLive(catalog, product.liveId) : null;
    let action = gameAction({
      ...stateInput,
      installing: !!installing,
      installFraction: fraction,
      canLaunch,
      priceText: live ? formatPrice(live.priceCents, live.currency) : null,
    });
    let actionDisabled = action.kind === "none";
    if (desktop && comingTonight(desktop) && !installing) {
      action = {
        kind: "none",
        label: releaseChecked[desktop.id] ? "Coming tonight" : "Checking...",
      };
      actionDisabled = true;
    } else if (desktop && macBrowserDownload(desktop) && action.kind === "install") {
      action = { kind: "install", label: "Download for Mac" };
    }
    const artifact = desktop ? artifactFor(desktop) : null;
    const detail = desktop ? details[desktop.id] : undefined;
    const sizeBytes =
      detail?.sizeBytes ??
      artifact?.size ??
      (desktop?.installSizeMb ? desktop.installSizeMb * 1024 * 1024 : null);
    const lastPlayed = detail?.lastPlayedAt
      ? new Date(detail.lastPlayedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : "-";
    return {
      product,
      desktop,
      title: product.title,
      blurb: product.blurb,
      state: gameState(stateInput),
      action,
      actionDisabled,
      sizeText: desktop ? formatBytes(sizeBytes) : "Web",
      lastPlayed,
      installedVersion,
      latestVersion: latest,
      updateAvailable,
      owned,
      hasWeb,
    };
  }

  function runAction(row: GameRow): void {
    switch (row.action.kind) {
      case "update":
      case "install":
        if (row.desktop) void handleInstall(row.desktop);
        break;
      case "launch":
        if (row.desktop) void handleLaunch(row.desktop);
        break;
      case "web":
        void handleWeb(row.product);
        break;
      case "buy":
        handleBuy(row.product);
        break;
      default:
        break;
    }
  }

  const allRows = CATALOG.filter((product) => !product.companionOf).map(rowFor);
  const rows = allRows.filter((row) => libraryIds.has(row.product.id));
  const selectedRow = gameId ? (allRows.find((row) => row.product.id === gameId) ?? null) : null;
  const running = activeDownloads(downloads);
  const showSignIn = ready && !session && !guest;

  const signedInAccountName = session?.username ?? null;

  return (
    <div className="app">
      <TopBar
        view={view}
        onView={(next) => {
          setView(next);
          setGameId(null);
        }}
        downloadCount={running.length}
        accountName={signedInAccountName}
        onAccount={() => {
          if (session) {
            setView("account");
            setGameId(null);
          } else {
            setGuest(false);
            setView("library");
          }
        }}
      />

      {updateInfo ? (
        <div className="update-bar" role="status">
          <span>
            <strong>Lakeside {updateInfo.version} is available.</strong>{" "}
            {updateInfo.notes || "A new launcher build is ready to install."}
          </span>
          <button
            type="button"
            className="btn sm p"
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
            className="btn sm"
            onClick={() => setUpdateInfo(null)}
            disabled={updating}
          >
            Later
          </button>
        </div>
      ) : null}

      <main className="page">
        {!ready ? (
          <div className="loading">Loading your library...</div>
        ) : showSignIn ? (
          <SignInView
            freeGames={rows.filter((row) => row.product.entitlementIds.length === 0)}
            onSignIn={(provider) => void handleSignIn(provider)}
            onGuest={continueAsGuest}
          />
        ) : view === "library" && selectedRow ? (
          <GameView
            row={selectedRow}
            entitlements={entitlements}
            catalog={catalog}
            notes={selectedRow.desktop ? (notes[selectedRow.desktop.id] ?? []) : []}
            location={selectedRow.desktop ? (details[selectedRow.desktop.id]?.location ?? null) : null}
            capabilities={capabilities}
            platform={platform}
            busy={busy === selectedRow.desktop?.id}
            onBack={() => setGameId(null)}
            onAction={() => runAction(selectedRow)}
            onWeb={() => void handleWeb(selectedRow.product)}
            onBuy={() => handleBuy(selectedRow.product)}
            onOpenUrl={(url) => openUrl(url)}
            onOpenFolder={() =>
              selectedRow.desktop
                ? void runBackend("Open folder", () => openInstallFolder(selectedRow.desktop!.id))
                : undefined
            }
            onRepair={() =>
              selectedRow.desktop
                ? void runBackend("Repair", () => repairInstall(selectedRow.desktop!.id))
                : undefined
            }
            onUninstall={() => {
              const desktop = selectedRow.desktop;
              if (!desktop) return;
              void runBackend("Uninstall", async () => {
                await uninstallProduct(desktop.id);
                setInstalled((previous) => {
                  const next = { ...previous };
                  delete next[desktop.id];
                  return next;
                });
                setNotice(`Uninstalled ${desktop.title}. Your saves were not touched.`);
              });
            }}
          />
        ) : view === "library" ? (
          <LibraryView
            rows={rows}
            signedIn={session !== null}
            onSelect={(row) => setGameId(row.product.id)}
            onAction={runAction}
            onSignIn={() => setGuest(false)}
          />
        ) : view === "store" ? (
          <StoreView
            catalog={catalog}
            live={catalogResult?.live ?? false}
            entitlements={entitlements}
            products={CATALOG.filter((product) => !product.companionOf)}
            signedIn={session !== null}
            onBuy={handleBuy}
            onOpenUrl={(url) => openUrl(url)}
            onOpenGame={(product) => {
              setView("library");
              setGameId(product.id);
            }}
            onRefresh={() =>
              void refreshEntitlements().then(
                () => setNotice("Purchases refreshed."),
                (error: unknown) => setNotice(message(error)),
              )
            }
          />
        ) : view === "downloads" ? (
          <DownloadsView
            items={downloads}
            capabilities={capabilities}
            onCancelQueued={(id) =>
              setDownloads((previous) => previous.filter((item) => !(item.id === id && item.status === "queued")))
            }
            onClearFinished={() =>
              setDownloads((previous) => previous.filter((item) => item.status === "queued" || item.status === "running"))
            }
            onRetry={(id) => {
              const product = PRODUCTS_BY_ID.get(id);
              if (product) enqueueInstall(product);
            }}
            onOpenFolder={() => {
              const first = Object.keys(installed)[0];
              if (first) void runBackend("Open folder", () => openInstallFolder(first));
            }}
          />
        ) : (
          <AccountView
            session={session}
            entitlements={entitlements}
            catalog={catalog}
            onSignIn={(provider) => void handleSignIn(provider)}
            onSignOut={() => void handleSignOut()}
            onOpenUrl={(url) => openUrl(url)}
            onRefresh={() =>
              void refreshEntitlements().then(
                () => setNotice("Purchases refreshed."),
                (error: unknown) => setNotice(message(error)),
              )
            }
            accountUrl={ACCOUNT_URL}
          />
        )}
      </main>

      {notice ? (
        <div className="toast" role="status">
          {notice}
        </div>
      ) : null}

      <StatusBar
        items={downloads}
        onOpenDownloads={() => {
          setView("downloads");
          setGameId(null);
        }}
      />
    </div>
  );
}
