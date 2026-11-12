# lakeside-launcher

The Lakeside Games launcher: one library, one account and one update path for
our web and native games.

This is Phase 0. It is a working shell with a real catalog and launch paths, a
demo platform client, and a live client aimed at endpoints that are specified
but not deployed yet. It does **not** install or update games yet.

## Download (Windows, 0.1.0)

- Installer: [Lakeside_0.1.0_x64-setup.exe](https://github.com/lakesidegamedev/lakeside-launcher/releases/download/v0.1.0/Lakeside_0.1.0_x64-setup.exe)
- Portable: [Lakeside.exe](https://github.com/lakesidegamedev/lakeside-launcher/releases/download/v0.1.0/Lakeside.exe)

The build is unsigned, so SmartScreen warns once. The installer bootstraps
WebView2 if it is missing; the portable exe expects the WebView2 runtime.

## What Phase 0 ships

- Library grid with owned/free tiles, search, and a detail sheet.
- Store list driven by the same product ids as `lakeside-accounts/products.js`.
- Account view with session, purchases and device placeholders.
- Sign-in through `lakeside-auth`: system browser, loopback callback listener,
  `state` nonce, then code exchange through the platform client.
- Web games open in a dedicated Tauri window with **no capabilities**.
- Native games launch from a catalog-relative path resolved under the install
  root, rejected if it escapes, missing, or not a file.
- Demo mode (default) so the UI is usable before the platform endpoints land.

## Run

```sh
npm install
npm run dev            # browser preview of the UI
npm run dev:desktop    # Tauri window (needs Rust and webkit2gtk)
npm test               # catalog and entitlement rules
npm run build:web      # typecheck + production web build
```

Native install root:

```sh
export LAKESIDE_INSTALL_ROOT="$HOME/.local/share/lakeside-launcher/products"
```

Layout expected by the catalog:

```
products/
  AHDClient/AHDClient.exe          (or ahdclient.AppImage on Linux)
  CorporateWarfare/CorporateWarfare.exe
```

## Platform mode

`src/platform/client.ts` is the only place that talks to the platform.

| Mode | Behaviour |
| --- | --- |
| `demo` (default) | Local session and entitlements in `localStorage`. Purchases simulated. |
| `live` | `POST /launcher/session`, `GET /launcher/entitlements`, `POST /launcher/logout` on `https://lakesidegames.net` (override with `VITE_PLATFORM_API`). |

The live endpoints are the Phase 2 contract and are not deployed. A 404 is
reported as such instead of being hidden.

Sign-in uses Discord as the primary provider because the AHD session cookie is
scoped to `.ahousedividedgame.com`; AHD sign-in needs the
`auth.ahousedividedgame.com` sibling ingress described in
`lakeside-auth/DESIGN.md`.

## Security rules

- Only the `main` window has a capability entry. Game windows are external
  URLs with no capability, so remote pages cannot reach IPC or the filesystem.
- `open_external` accepts https on Lakeside-owned hosts only. It is not a
  generic URL opener.
- `launch_product` never accepts an absolute path or `..`; it canonicalizes
  under the install root and verifies containment.
- The launcher never renders a card form and never sends a price. Checkout
  opens the existing `lakesidegames.net/account/checkout` flow.
- Entitlements are display hints. The platform remains authoritative.

## Not in Phase 0

- Download, install, update and rollback (the manifest service).
- Durable device sessions and refresh tokens in `lakeside-auth`.
- The launcher-facing entitlement endpoint in `lakeside-accounts`.
- Signed artifacts and presigned download URLs.
- Cloud saves, friends and presence.

## Release manifest

`scripts/manifest.mjs` turns GitHub Releases into the launcher's Phase 1
manifest. It maps each release asset to an OS/arch key and records name, size,
sha256 (when GitHub exposes a digest) and download URL.

```sh
npm run manifest -- --channel stable --out manifest/manifest.json
```

Set `LAUNCHER_MANIFEST_KEY` to an Ed25519 private key in PEM form to sign the
manifest. Production builds must reject unsigned manifests; the CLI warns and
emits `"signature": null` when the key is absent.

Artifact keys: `windows-x64`, `macos-arm64`, `macos-x64`, `linux-x64`,
`linux-deb`, `android`. The pure transform lives in `buildManifest` and has
fixture coverage in `scripts/manifest.test.mjs`.

## Auto-update

The app checks `https://lakesidegames.net/download/launcher/latest.json` on
startup and offers **Update and restart** when a newer signed build exists. The
Tauri updater verifies the minisign signature against the public key compiled
into `tauri.conf.json` before running the NSIS installer in passive mode.

Publishing a build:

```sh
# after a successful desktop-bundles run, download its artifacts
gh run download <run-id> -R lakesidegamedev/lakeside-launcher \
  -n lakeside-windows-x64 -D /tmp/lakeside-build

npm run publish:update -- \
  --version 0.2.0 \
  --installer /tmp/lakeside-build/Lakeside_0.2.0_x64-setup.exe \
  --signature /tmp/lakeside-build/Lakeside_0.2.0_x64-setup.exe.sig \
  --notes "What changed"
```

That copies the installer and signature into
`/var/www/lakeside-landing/download/launcher/` and rewrites `latest.json`
atomically. Caddy serves the directory publicly, so no GitHub credentials are
needed by players.

The updater private key lives at `/root/.tauri/lakeside-launcher.key` with its
password beside it, outside the repository. CI reads the key from the
`TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` secrets.
Losing either makes future updates impossible; back them up before rotating.

Version 0.1.0 predates the updater, so 0.2.0 is the last manual install. Every
build after that can update in place.

## CI and desktop builds

- `.github/workflows/verify.yml` runs the frontend tests, web build, Rust check
  and Rust unit tests.
- `.github/workflows/desktop-bundles.yml` builds the Windows NSIS installer and
  a raw `Lakeside.exe` on `windows-latest`, uploaded as
  `lakeside-windows-x64`. Run it from Actions or push a `v*` tag.

The Windows binaries are unsigned for now. SmartScreen will warn until a
signing certificate is configured.

## Catalog sync

`src/catalog.ts` copies the commercial fields from
`lakeside-accounts/products.js` and adds delivery metadata. Until the manifest
service exists, a price or product id change must be made in both places, and
`src/catalog.test.ts` guards the local invariants (unique ids, https web URLs,
per-platform executables).
