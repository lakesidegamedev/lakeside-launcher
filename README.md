# lakeside-launcher

The Lakeside Games launcher: one library, one account and one update path for
our web and native games.

This is the live launcher: signed auto-update, live Lakeside identity and
entitlements, and one-click AHDClient install/update on Windows.

## Download (Windows, 0.3.2)

- Installer: [Lakeside_0.3.2_x64-setup.exe](https://github.com/lakesidegamedev/lakeside-launcher/releases/download/v0.3.2/Lakeside_0.3.2_x64-setup.exe)
- Portable: [Lakeside.exe](https://github.com/lakesidegamedev/lakeside-launcher/releases/download/v0.3.2/Lakeside.exe)

The build is currently unsigned, so SmartScreen warns once. The release
workflow signs and timestamps both binaries automatically as soon as the
`WINDOWS_CERTIFICATE` and `WINDOWS_CERTIFICATE_PASSWORD` secrets are set; see
[Windows code signing](#windows-code-signing).

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
| `live` (desktop default) | Rust redeems the broker code at `POST /account/launcher/session`, stores the opaque token with 0600 permissions outside the webview, and reads `GET /account/launcher/entitlements`. Override the base with `VITE_PLATFORM_API`. |
| `demo` (browser preview default) | Local session and entitlements in `localStorage`. Purchases simulated. Force it in a desktop build with `VITE_PLATFORM_MODE=demo`. |

The live endpoints are deployed: accounts issues a 30-day unified portal
session, revocable through the same table as the browser portal. Sign-in uses
Discord because the AHD session cookie is scoped to `.ahousedividedgame.com`;
AHD sign-in needs the `auth.ahousedividedgame.com` sibling ingress described in
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

## Not yet

- Cloud saves, friends and presence.
- Game rollback; installs replace the previous version in place.
- Automatic game install on macOS and Linux.
- Delta updates for large games.
- Windows code signing, so SmartScreen still warns once.

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

The updater private key lives outside the repository in the deployment
environment. CI reads it from the `TAURI_SIGNING_PRIVATE_KEY` and
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` secrets. Losing either makes future
updates impossible; back them up before rotating.

Version 0.1.0 predates the updater. 0.2.x and 0.3.x update in place; users on
0.1.0 need one manual install of 0.3.2 or later.

## Installing a game

The launcher reads the signed manifest at
`https://lakesidegames.net/download/launcher/manifest.json`. The manifest is
regenerated every ten minutes by `lakeside-launcher-manifest.timer`, so a new
game release appears without shipping a launcher update. When a native game is
owned and not installed, its detail sheet offers **Install**:

1. Download the artifact from the URL in the manifest.
2. Verify its sha256 against the digest in the manifest.
3. Run the NSIS installer silently.
4. Confirm the expected executable exists under the install root, then record
   the installed version.

Installed versions are kept in `installs.json` under the app config directory,
with the Windows uninstall registry as a fallback for games installed outside
the launcher. The detail sheet offers **Update to x.y.z** only when the
manifest version is newer than what is installed; otherwise it offers
**Launch desktop** and a separate **Reinstall latest**.

On Windows the install root is `%LOCALAPPDATA%`, because the Tauri installers
install per-user. AHDClient lands at
`%LOCALAPPDATA%\AHDClient\ahdclient-desktop.exe`. The same path updates an
existing install; the detail sheet offers **Update to x.y.z** when a build is
already present.

Automatic install is Windows-only. Linux and macOS builds launch from
`LAKESIDE_INSTALL_ROOT` but must be installed manually for now.

## Windows code signing

Both the installer and the portable exe are signed and timestamped when these
repository secrets exist:

| Secret | Value |
| --- | --- |
| `WINDOWS_CERTIFICATE` | Base64 of the code-signing `.pfx` |
| `WINDOWS_CERTIFICATE_PASSWORD` | The PFX password |

The workflow imports the certificate, passes its thumbprint to Tauri with
`digestAlgorithm: sha256` and a DigiCert timestamp URL, then verifies every
artifact with `Get-AuthenticodeSignature`. If the secret is absent the build
logs `building unsigned` and continues, so forks and local builds still work.
If the secret is present but a signature is invalid, the job fails.

Do not commit the PFX. Convert it and store it as the secret:

```sh
base64 -w0 lakeside-code-signing.pfx | gh secret set WINDOWS_CERTIFICATE
gh secret set WINDOWS_CERTIFICATE_PASSWORD
```

Certificate options:

- **OV or EV code-signing certificate exported as PFX.** The simplest route.
  An OV certificate still accumulates SmartScreen reputation over time; EV
  normally has immediate reputation.
- **Azure Trusted Signing.** Subscription plus organization identity
  validation, then a custom `bundle.windows.signCommand` instead of a PFX.

Until either is provided, Windows shows the unknown-publisher warning.

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
