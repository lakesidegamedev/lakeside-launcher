# lakeside-launcher

The Lakeside Games launcher: one library, one account and one update path for
our web and native games.

This is Phase 0. It is a working shell with a real catalog and launch paths, a
demo platform client, and a live client aimed at endpoints that are specified
but not deployed yet. It does **not** install or update games yet.

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

## Catalog sync

`src/catalog.ts` copies the commercial fields from
`lakeside-accounts/products.js` and adds delivery metadata. Until the manifest
service exists, a price or product id change must be made in both places, and
`src/catalog.test.ts` guards the local invariants (unique ids, https web URLs,
per-platform executables).
