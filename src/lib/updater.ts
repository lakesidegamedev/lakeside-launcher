// In-app updater. The Tauri plugin verifies the minisign signature against the
// public key in tauri.conf.json before running the installer, so the feed can
// be served from a plain static host.
//
// Browser preview has no updater; every entry point degrades quietly.

import { isDesktop } from "./tauri";

export interface UpdateInfo {
  version: string;
  notes: string;
  date: string | null;
}

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (!isDesktop()) return null;
  const { check } = await import("@tauri-apps/plugin-updater");
  const update = await check();
  if (!update) return null;
  return {
    version: update.version,
    notes: update.body ?? "",
    date: update.date ?? null,
  };
}

/**
 * Download, verify, install and relaunch. The NSIS installer runs in passive
 * mode, so the player sees a small progress window and then the new version.
 */
export async function installUpdate(
  onProgress: (fraction: number | null) => void,
): Promise<void> {
  if (!isDesktop()) {
    throw new Error("Updates need the desktop launcher.");
  }

  const { check } = await import("@tauri-apps/plugin-updater");
  const update = await check();
  if (!update) throw new Error("No update is available.");

  let downloaded = 0;
  let total = 0;
  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case "Started":
        total = event.data.contentLength ?? 0;
        onProgress(total > 0 ? 0 : null);
        break;
      case "Progress":
        downloaded += event.data.chunkLength;
        onProgress(total > 0 ? Math.min(downloaded / total, 1) : null);
        break;
      case "Finished":
        onProgress(1);
        break;
    }
  });

  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}
