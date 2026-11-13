import { useState } from "react";
import { formatPrice, type Entitlements, type Platform } from "../catalog";
import type { GameRow } from "../lib/rows";
import type { Capability, PatchNote } from "../lib/tauri";
import {
  addOnRows,
  addonsFor,
  findLive,
  tierDescription,
  tierPrice,
  type LiveCatalog,
} from "../lib/liveCatalog";
import { formatDay, plainNotes } from "../lib/format";
import { Thumb } from "./Thumb";

interface Props {
  row: GameRow;
  entitlements: Entitlements;
  catalog: LiveCatalog | null;
  notes: readonly PatchNote[];
  location: string | null;
  capabilities: ReadonlySet<Capability>;
  platform: Platform;
  busy: boolean;
  onBack: () => void;
  onAction: () => void;
  onWeb: () => void;
  onExtraDownload: () => void;
  onBuy: () => void;
  onOpenUrl: (url: string) => void;
  onOpenFolder: () => void;
  /** The published installer can be downloaded again for this game on this system. */
  canReinstall: boolean;
  onReinstall: () => void;
  onUninstall: () => void;
}

const WHERE: Record<string, string> = {
  windows: "Windows",
  macos: "macOS",
  linux: "Linux",
  android: "Android",
};

export function GameView({
  row,
  entitlements,
  catalog,
  notes,
  location,
  capabilities,
  busy,
  onBack,
  onAction,
  onWeb,
  onExtraDownload,
  onBuy,
  onOpenUrl,
  onOpenFolder,
  canReinstall,
  onReinstall,
  onUninstall,
}: Props): JSX.Element {
  const [confirming, setConfirming] = useState(false);
  const { product } = row;
  const edition = catalog ? findLive(catalog, product.liveId) : null;
  const addons = catalog ? addOnRows(addonsFor(product, catalog), entitlements) : [];
  const tiers = catalog
    ? catalog.subscriptions.filter(
        (tier) =>
          (product.liveId !== null && tier.grants.includes(product.liveId)) ||
          (product.addonGame === "electioneer" && tier.grants.includes("complete")),
      )
    : [];
  const editionOwned = product.entitlementIds.some((id) => entitlements[id] === "owned");
  const showWebSecondary = row.hasWeb && row.action.kind !== "web";
  const desktopPlatforms = product.platforms
    .filter((platform) => platform !== "browser")
    .map((platform) => WHERE[platform] ?? platform);
  const installed = row.installedVersion !== null;
  const shownNotes = notes.filter((note) => note.body.trim().length > 0).slice(0, 3);

  const folder = capabilities.has("open_install_folder");
  const uninstall = capabilities.has("uninstall_product");

  return (
    <section>
      <div className="crumbs">
        <button type="button" className="textlink" onClick={onBack}>
          Library
        </button>{" "}
        / <span>{row.title}</span>
      </div>
      <div className="two">
        <div>
          <div className="gamehead">
            <Thumb product={product} large />
            <div className="grow">
              <h1>
                <span className="dot" style={{ background: product.accent }} /> {row.title}
                <span className={`state inline ${row.state.tone}`}>{row.state.label}</span>
              </h1>
              <div className="sub">{row.blurb}</div>
              {row.freeText ? <div className="sub owned">{row.freeText}</div> : null}
            </div>
            <div className="actions">
              <button
                type="button"
                className="btn p"
                disabled={row.actionDisabled || busy}
                onClick={onAction}
              >
                {busy ? "Opening..." : row.action.label}
              </button>
              {row.extraDownload ? (
                <button type="button" className="btn s" onClick={onExtraDownload}>
                  {row.extraDownload.label}
                </button>
              ) : null}
              {showWebSecondary ? (
                <button type="button" className="btn s" onClick={onWeb}>
                  Play in browser
                </button>
              ) : null}
            </div>
          </div>

          {shownNotes.length > 0 ? (
            <>
              <h2>Patch notes</h2>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 84 }}>Version</th>
                    <th style={{ width: 96 }}>Date</th>
                    <th>Changes</th>
                  </tr>
                </thead>
                <tbody>
                  {shownNotes.map((note) => (
                    <tr key={note.version}>
                      <td>
                        <b>{note.version}</b>
                      </td>
                      <td className="muted">{formatDay(note.publishedAt)}</td>
                      <td className="wrap">{plainNotes(note.body)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : null}

          {edition || addons.length > 0 || tiers.length > 0 ? (
            <>
              <h2>Add-ons and editions</h2>
              <table>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Status</th>
                    <th className="r" />
                  </tr>
                </thead>
                <tbody>
                  {edition ? (
                    <tr>
                      <td>
                        <b>{edition.name}</b>
                      </td>
                      <td>
                        {editionOwned ? (
                          <span className="owned">Owned</span>
                        ) : (
                          <span className="muted">Not owned</span>
                        )}
                      </td>
                      <td className="r">
                        {editionOwned ? null : (
                          <button type="button" className="btn sm p" onClick={onBuy}>
                            Buy {formatPrice(edition.priceCents, edition.currency)}
                          </button>
                        )}
                      </td>
                    </tr>
                  ) : null}
                  {addons.map((addon) => (
                    <tr key={addon.key}>
                      <td>
                        <b>{addon.name}</b>
                        <br />
                        <small className="muted">{addon.detail}</small>
                      </td>
                      <td>
                        {addon.owned ? (
                          <span className="owned">Owned</span>
                        ) : (
                          <span>{addon.priceText}</span>
                        )}
                      </td>
                      <td className="r">
                        {addon.owned ? null : (
                          <button type="button" className="btn sm" onClick={onBuy}>
                            {addon.group ? "Choose" : "Buy"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {tiers.map((tier) => (
                    <tr key={tier.id}>
                      <td className="wrap">
                        <b>{tier.name}</b>
                        <br />
                        <small className="muted">
                          {tierDescription(tier, catalog as LiveCatalog)}
                        </small>
                      </td>
                      <td>{tierPrice(tier)}</td>
                      <td className="r">
                        <button
                          type="button"
                          className="btn sm"
                          onClick={() => onOpenUrl("https://lakesidegames.net/account")}
                        >
                          Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : null}
        </div>

        <aside>
          {row.desktop && installed ? (
            <div className="panel">
              <h3>Installed</h3>
              <div className="kv">
                <span>Version</span>
                <span>{row.installedVersion}</span>
                <span>Latest</span>
                <span className={row.updateAvailable ? "upd" : ""}>{row.latestVersion ?? "-"}</span>
                <span>Size on disk</span>
                <span>{row.sizeText}</span>
                <span>Location</span>
                <span className="path">{location ?? "Managed by the launcher"}</span>
                <span>Last played</span>
                <span>{row.lastPlayed}</span>
              </div>
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
                <button
                  type="button"
                  className="btn sm"
                  disabled={!canReinstall}
                  title={canReinstall ? undefined : "No verified installer is published for this system"}
                  onClick={onReinstall}
                >
                  Reinstall
                </button>
                {confirming ? (
                  <button
                    type="button"
                    className="btn sm danger"
                    onClick={() => {
                      setConfirming(false);
                      onUninstall();
                    }}
                  >
                    Confirm uninstall
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn sm danger"
                    disabled={!uninstall}
                    title={uninstall ? undefined : "Not available in this version of the launcher"}
                    onClick={() => setConfirming(true)}
                  >
                    Uninstall
                  </button>
                )}
              </div>
            </div>
          ) : null}
          <div className="panel" style={{ marginTop: installed ? 12 : 0 }}>
            <h3>Where you can play</h3>
            <div className="kv">
              {desktopPlatforms.length > 0 ? (
                <>
                  <span>Desktop</span>
                  <span>{desktopPlatforms.join(", ")}</span>
                </>
              ) : null}
              {row.hasWeb ? (
                <>
                  <span>Browser</span>
                  <span>Free, always current</span>
                </>
              ) : null}
            </div>
          </div>
          {installed && canReinstall ? (
            <div className="note" style={{ marginTop: 12 }}>
              Reinstall downloads the published installer again, checks it against its checksum and runs it
              over the current install. Saves are not touched.
            </div>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
