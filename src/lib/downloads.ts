// The download queue as plain data, so the Downloads tab, the bottom bar and
// the tests all read the same thing.

export type DownloadStatus = "queued" | "running" | "done" | "failed";

export interface DownloadItem {
  /** Product id; one active item per product. */
  id: string;
  title: string;
  kind: "install" | "update";
  version: string;
  status: DownloadStatus;
  downloaded: number;
  total: number | null;
  /** Smoothed bytes per second, null until two samples exist. */
  speed: number | null;
  sampleAt: number | null;
  error: string | null;
  finishedAt: number | null;
}

export function newDownload(
  id: string,
  title: string,
  kind: "install" | "update",
  version: string,
): DownloadItem {
  return {
    id,
    title,
    kind,
    version,
    status: "queued",
    downloaded: 0,
    total: null,
    speed: null,
    sampleAt: null,
    error: null,
    finishedAt: null,
  };
}

/** Fold a progress event into an item, smoothing the speed. */
export function applyProgress(
  item: DownloadItem,
  downloaded: number,
  total: number | null,
  now: number,
): DownloadItem {
  let speed = item.speed;
  if (item.sampleAt !== null && now > item.sampleAt && downloaded >= item.downloaded) {
    const instant = ((downloaded - item.downloaded) * 1000) / (now - item.sampleAt);
    speed = item.speed === null ? instant : item.speed * 0.7 + instant * 0.3;
  }
  return { ...item, downloaded, total, speed, sampleAt: now };
}

export function fractionOf(item: DownloadItem): number | null {
  if (!item.total || item.total <= 0) return null;
  return Math.min(item.downloaded / item.total, 1);
}

export function etaSeconds(item: DownloadItem): number | null {
  if (!item.total || !item.speed || item.speed <= 0) return null;
  return Math.max(item.total - item.downloaded, 0) / item.speed;
}

export function activeDownloads(items: readonly DownloadItem[]): readonly DownloadItem[] {
  return items.filter((item) => item.status === "queued" || item.status === "running");
}

/** The id to start next: nothing while one runs, else the first queued. */
export function nextToStart(items: readonly DownloadItem[]): string | null {
  if (items.some((item) => item.status === "running")) return null;
  return items.find((item) => item.status === "queued")?.id ?? null;
}
