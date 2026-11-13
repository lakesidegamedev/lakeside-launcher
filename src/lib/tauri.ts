// Thin wrapper over Tauri commands. Every call degrades to a clear error in a
// plain browser, so the Vite build stays inspectable without the desktop shell.

export function isDesktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isDesktop()) {
    throw new Error("This action needs the desktop launcher.");
  }
  const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
  return tauriInvoke<T>(command, args);
}

export interface SignInStart {
  returnUrl: string;
  port: number;
  state: string;
}

export async function beginSignIn(): Promise<SignInStart> {
  return invoke<SignInStart>("begin_sign_in");
}

export async function onSignInCode(handler: (code: string) => void): Promise<() => void> {
  if (!isDesktop()) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  const unlisten = await listen<string>("sign-in-code", (event) => handler(event.payload));
  return unlisten;
}

export async function openExternal(url: string): Promise<void> {
  await invoke<void>("open_external", { url });
}

export async function openWebGame(productId: string, url: string, title: string): Promise<void> {
  await invoke<void>("open_web_game", { productId, url, title });
}

export async function launchProduct(
  productId: string,
  executable: string,
  handoffClientId?: string,
): Promise<void> {
  await invoke<void>("launch_product", {
    productId,
    executable,
    handoffClientId: handoffClientId ?? null,
  });
}

export interface DesktopApp {
  version: string;
  installLocation: string;
}

/** Windows app detected from its own uninstall registry entry, or null. */
export async function detectDesktopApp(productId: string): Promise<DesktopApp | null> {
  try {
    return await invoke<DesktopApp | null>("detect_desktop_app", { productId });
  } catch {
    return null;
  }
}

export async function launchDesktopApp(
  productId: string,
  handoffClientId?: string,
): Promise<void> {
  await invoke<void>("launch_desktop_app", {
    productId,
    handoffClientId: handoffClientId ?? null,
  });
}

export interface ReleaseArtifact {
  name: string;
  kind: string;
  url: string;
  size: number | null;
  sha256: string | null;
}

export interface ReleaseProduct {
  name: string;
  version: string;
  tag: string;
  publishedAt: string | null;
  notesUrl: string | null;
  artifacts: Record<string, ReleaseArtifact>;
}

export interface ReleaseManifest {
  schema: number;
  channel: string;
  generatedAt: string;
  products: Record<string, ReleaseProduct>;
}

export async function getReleaseManifest(): Promise<ReleaseManifest> {
  return invoke<ReleaseManifest>("get_release_manifest");
}

/**
 * Release details for a paid product, read by the launcher backend with the
 * stored session. Null when nothing is published or the player is signed out.
 */
export async function getAccountRelease(commercialId: string): Promise<ReleaseProduct | null> {
  return invoke<ReleaseProduct | null>("account_release", { commercialId });
}

export interface InstallProgress {
  productId: string;
  downloaded: number;
  total: number | null;
}

export interface InstallResult {
  version: string;
  executable: string;
  action: "install" | "update" | "reinstall";
}

export interface InstalledProduct {
  version: string;
  executable: string;
  installedAt: number;
}

export async function installedProducts(): Promise<Record<string, InstalledProduct>> {
  return invoke<Record<string, InstalledProduct>>("installed_products");
}

export interface InstallRequest {
  productId: string;
  version: string;
  url: string;
  sha256: string;
  fileName: string;
  kind: string;
  /** Set for paid builds: the commercial product id for the accounts download. */
  commercialId?: string;
}

export async function isInstalled(executable: string): Promise<boolean> {
  try {
    return await invoke<boolean>("is_installed", { executable });
  } catch {
    return false;
  }
}

export async function installRelease(request: InstallRequest): Promise<InstallResult> {
  return invoke<InstallResult>("install_release", {
    ...request,
    commercialId: request.commercialId ?? null,
  });
}

export async function onInstallProgress(
  handler: (progress: InstallProgress) => void,
): Promise<() => void> {
  if (!isDesktop()) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  return listen<InstallProgress>("install-progress", (event) => handler(event.payload));
}

export interface PlatformSession {
  username: string;
  email: string | null;
  provider: string;
  avatarUrl: string | null;
}

export async function platformSession(): Promise<PlatformSession | null> {
  return invoke<PlatformSession | null>("platform_session");
}

export async function platformExchange(code: string): Promise<PlatformSession> {
  return invoke<PlatformSession>("platform_exchange", { code });
}

export async function platformEntitlements(): Promise<Record<string, string>> {
  return invoke<Record<string, string>>("platform_entitlements");
}

export async function platformSignOut(): Promise<void> {
  await invoke<void>("platform_sign_out");
}
