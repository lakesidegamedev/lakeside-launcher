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

export async function launchProduct(productId: string, executable: string): Promise<void> {
  await invoke<void>("launch_product", { productId, executable });
}
