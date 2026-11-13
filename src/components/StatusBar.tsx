import { activeDownloads, fractionOf, type DownloadItem } from "../lib/downloads";
import { formatBytes, formatSpeed } from "../lib/format";

interface Props {
  items: readonly DownloadItem[];
  onOpenDownloads: () => void;
}

export function StatusBar({ items, onOpenDownloads }: Props): JSX.Element {
  const active = activeDownloads(items);
  const current = active.find((item) => item.status === "running") ?? active[0];
  if (!current) {
    return (
      <footer className="status">
        <span>No downloads running</span>
      </footer>
    );
  }
  const fraction = fractionOf(current);
  const waiting = active.length - 1;
  return (
    <footer className="status">
      <span>
        <b>{current.status === "running" ? "Downloading" : "Waiting"}</b> {current.title} {current.version}
      </span>
      <span className="bar" aria-hidden="true">
        <i style={{ width: `${Math.round((fraction ?? 0) * 100)}%` }} />
      </span>
      <span>
        {fraction === null
          ? formatBytes(current.downloaded)
          : `${Math.round(fraction * 100)}%`}
        {current.speed ? `, ${formatSpeed(current.speed)}` : ""}
      </span>
      {waiting > 0 ? <span className="muted">{waiting} more waiting</span> : null}
      <button type="button" className="textlink sp" onClick={onOpenDownloads}>
        Downloads
      </button>
    </footer>
  );
}
