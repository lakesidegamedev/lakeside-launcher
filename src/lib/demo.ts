// Sample data for the browser preview (no desktop shell, demo account), so the
// screens can be seen and screenshotted without installing anything. Never
// used in the desktop app.

import type { InstalledProduct, PatchNote, ReleaseProduct } from "./tauri";
import type { DownloadItem } from "./downloads";

export const DEMO_RELEASES: Record<string, ReleaseProduct> = {
  ahd: {
    name: "A House Divided",
    version: "2.11.0",
    tag: "v2.11.0",
    publishedAt: "2026-11-12T05:07:02Z",
    notesUrl: "https://github.com/lakesidegamedev/AHDClient/releases/tag/v2.11.0",
    artifacts: {
      "windows-x64": {
        name: "AHDClient_2.11.0_x64-setup.exe",
        kind: "nsis",
        url: "https://github.com/lakesidegamedev/AHDClient/releases/download/v2.11.0/AHDClient_2.11.0_x64-setup.exe",
        size: 87619097,
        sha256: "demo",
      },
      "linux-x64": {
        name: "AHDClient_2.11.0_amd64.AppImage",
        kind: "appimage",
        url: "https://github.com/lakesidegamedev/AHDClient/releases/download/v2.11.0/AHDClient_2.11.0_amd64.AppImage",
        size: 285710840,
        sha256: "demo",
      },
    },
  },
  "corporate-warfare": {
    name: "Corporate Warfare",
    version: "1.9.0",
    tag: "v1.9.0",
    publishedAt: "2026-10-31T16:10:45Z",
    notesUrl: null,
    artifacts: {
      "windows-x64": {
        name: "Corporate.Warfare-1.9.0-setup.exe",
        kind: "inno",
        url: "https://lakesidegames.net/account/launcher/download/corporate-warfare/windows-x86_64",
        size: 71369624,
        sha256: "demo",
      },
      "linux-x64": {
        name: "CorporateWarfare-1.9.0.AppImage",
        kind: "appimage",
        url: "https://lakesidegames.net/account/launcher/download/corporate-warfare/linux-x86_64",
        size: 67062558,
        sha256: "demo",
      },
    },
  },
};

export const DEMO_INSTALLED: Record<string, InstalledProduct> = {
  ahd: { version: "2.10.4", executable: "AHDClient/ahdclient-desktop.exe", installedAt: 1 },
  "corporate-warfare": {
    version: "1.9.0",
    executable: "Programs/Corporate Warfare/Corporate Warfare.exe",
    installedAt: 1,
  },
};

export const DEMO_NOTES: Record<string, PatchNote[]> = {
  ahd: [
    {
      version: "2.11.0",
      publishedAt: "2026-11-12T05:07:02Z",
      body: "Turn summary loads faster on slow connections. Fixed the party ballot showing last term's candidates.",
    },
    {
      version: "2.10.4",
      publishedAt: "2026-11-04T05:00:00Z",
      body: "Fixed budget totals rounding differently on desktop and web.",
    },
    {
      version: "2.10.3",
      publishedAt: "2026-10-28T05:00:00Z",
      body: "Corrected bond maturity dates shown in the ledger.",
    },
  ],
};

export const DEMO_DOWNLOADS: DownloadItem[] = [
  {
    id: "ahd",
    title: "A House Divided",
    kind: "update",
    version: "2.11.0",
    status: "running",
    downloaded: 54 * 1024 * 1024,
    total: 87619097,
    speed: 8.4 * 1024 * 1024,
    sampleAt: null,
    error: null,
    finishedAt: null,
  },
];
