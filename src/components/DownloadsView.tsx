import { useState } from "react";
import { etaSeconds, fractionOf, type DownloadItem } from "../lib/downloads";
import { formatBytes, formatDay, formatEta, formatSpeed } from "../lib/format";
import { PRODUCTS_BY_ID } from "../catalog";
import type { Capability } from "../lib/tauri";
import { Thumb } from "./Thumb";

interface Props {
  items: readonly DownloadItem[];
  capabilities: ReadonlySet<Capability>;
  onCancelQueued: (id: string) => void;
  onClearFinished: () => void;
  onRetry: (id: string) => void;
  onOpenFolder: () => void;
  /** Current install folder, or null when this shell cannot say. */
  installRoot: string | null;
  /** Ask the shell to use a new install folder (null for the default). Resolves to the folder in use. */
  onSetInstallRoot: (path: string | null) => Promise<string>;
}

function ItemCell({ item }: { item: DownloadItem }): JSX.Element {
  const product = PRODUCTS_BY_ID.get(item.id);
  return (
    <div className="rowlink static">
      {product ? <Thumb product={product} /> : null}
      <span>
        <b>{item.title}</b>
        <small>
          {item.kind === "update" ? "Update" : item.kind === "reinstall" ? "Reinstall" : "Install"} {item.version}
        </small>
      </span>
    </div>
  );
}

export function DownloadsView({
  items,
  capabilities,
  onCancelQueued,
  onClearFinished,
  onRetry,
  onOpenFolder,
  installRoot,
  onSetInstallRoot,
}: Props): JSX.Element {
  const [draft, setDraft] = useState("");
  const [rootMessage, setRootMessage] = useState<string | null>(null);
  const canChangeRoot = capabilities.has("set_install_root");
  async function applyRoot(next: string | null): Promise<void> {
    try {
      const used = await onSetInstallRoot(next);
      setRootMessage(`New installs go to ${used}.`);
      setDraft("");
    } catch (error) {
      setRootMessage(error instanceof Error ? error.message : String(error));
    }
  }
  const active = items.filter((item) => item.status === "running" || item.status === "queued");
  const finished = items.filter((item) => item.status === "done" || item.status === "failed");
  const running = active.filter((item) => item.status === "running").length;
  const queued = active.length - running;
  const folder = capabilities.has("open_install_folder");

  return (
    <section>
      <div className="head">
        <h1>Downloads</h1>
        <span className="muted">
          {active.length === 0 ? "Nothing downloading" : `${running} running, ${queued} waiting`}
        </span>
        <div className="sp">
          {finished.length > 0 ? (
            <button type="button" className="btn sm" onClick={onClearFinished}>
              Clear finished
            </button>
          ) : null}
        </div>
      </div>

      {active.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th style={{ width: "27%" }}>Item</th>
              <th>Progress</th>
              <th>Speed</th>
              <th>Remaining</th>
              <th className="r">Controls</th>
            </tr>
          </thead>
          <tbody>
            {active.map((item) => {
              const fraction = fractionOf(item);
              return (
                <tr key={item.id}>
                  <td>
                    <ItemCell item={item} />
                  </td>
                  <td>
                    <div className="prog">
                      <i style={{ width: `${Math.round((fraction ?? 0) * 100)}%` }} />
                    </div>
                    <small className="muted">
                      {item.status === "queued"
                        ? "Waiting for the current download"
                        : item.total
                          ? `${formatBytes(item.downloaded)} of ${formatBytes(item.total)}`
                          : formatBytes(item.downloaded)}
                    </small>
                  </td>
                  <td>{item.status === "running" ? formatSpeed(item.speed) : "-"}</td>
                  <td>{item.status === "running" ? formatEta(etaSeconds(item)) : "-"}</td>
                  <td className="r">
                    {item.status === "queued" ? (
                      <button type="button" className="btn sm" onClick={() => onCancelQueued(item.id)}>
                        Cancel
                      </button>
                    ) : (
                      <span className="muted">Downloading</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <div className="empty">No downloads running. Installs and updates you start show up here.</div>
      )}

      {finished.length > 0 ? (
        <>
          <h2>Finished</h2>
          <table>
            <tbody>
              {finished.map((item) => (
                <tr key={item.id}>
                  <td>
                    {item.title} {item.version}
                  </td>
                  <td className={item.status === "failed" ? "warnText" : "muted"}>
                    {item.status === "done" ? "Installed, files checked" : (item.error ?? "Failed")}
                  </td>
                  <td className="r muted">
                    {item.status === "failed" ? (
                      <button type="button" className="btn sm" onClick={() => onRetry(item.id)}>
                        Try again
                      </button>
                    ) : (
                      formatDay(item.finishedAt)
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}

      <div className="two even" style={{ marginTop: 14 }}>
        <div className="panel">
          <h3>Where files go</h3>
          <div className="sub" style={{ marginBottom: 9 }}>
            Each game gets its own folder here. Downloads are checked against the published build as they
            finish.
          </div>
          {installRoot ? <div className="path" style={{ marginBottom: 9 }}>{installRoot}</div> : null}
          {canChangeRoot ? (
            <div className="btnrow" style={{ marginBottom: 9 }}>
              <input
                type="text"
                value={draft}
                placeholder="New install folder (full path)"
                aria-label="New install folder"
                onChange={(event) => setDraft(event.target.value)}
                style={{ flex: 1, minWidth: 0 }}
              />
              <button
                type="button"
                className="btn sm"
                disabled={draft.trim().length === 0}
                onClick={() => void applyRoot(draft.trim())}
              >
                Use this folder
              </button>
              <button type="button" className="btn sm" onClick={() => void applyRoot(null)}>
                Default
              </button>
            </div>
          ) : null}
          {rootMessage ? <div className="sub" style={{ marginBottom: 9 }}>{rootMessage}</div> : null}
          <div className="btnrow">
            <button
              type="button"
              className="btn sm"
              disabled={!folder}
              title={folder ? undefined : "Not available in this version of the launcher"}
              onClick={onOpenFolder}
            >
              Open folder
            </button>
          </div>
        </div>
        <div className="panel">
          <h3>Pausing</h3>
          <div className="sub">
            Downloads run one at a time, in the order you started them. They cannot be paused and resumed
            yet; cancelling a waiting item removes it from the queue.
          </div>
        </div>
      </div>
    </section>
  );
}
