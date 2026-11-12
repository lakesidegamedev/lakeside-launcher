# Launcher roadmap

Phase 0 is in this repository. The rest is ordered by what unblocks the next
real user action, not by what is most interesting to build.

## Phase 1: signed manifest and installer

Goal: a player can install and update AHDClient from the launcher.

1. **Manifest service** at `https://lakesidegames.net/launcher/manifest.json`
   (static first, generated from the GitHub Releases API by the same box timer
   that writes `download/releases.json`).
2. Schema: channel, product, version, publishedAt, artifacts keyed by OS/arch
   with url, size, sha256 and an Ed25519 signature over the artifact list.
3. **Installer**: download to a temp file, verify size and sha256, verify the
   manifest signature, unpack into `products/<id>/<version>/`, flip a pointer,
   keep one previous version for rollback.
4. **Updater**: check on launch in the background, apply on exit or restart.
5. Decide who owns the AHD install: the hub or AHDClient. Never both.
6. Sign Windows and macOS builds. A launcher that installs silently makes an
   unsigned chain much more visible than a manual download does.

## Phase 2: identity and entitlements

Goal: sign in once, see the right library, buy without leaving the flow.

1. `lakeside-auth`: persistent session store, refresh rotation, device records
   and revocation, and a loopback redirect allowance for the launcher client
   (`http://127.0.0.1:<ephemeral>/callback`). Phase 1 is in-memory, single
   process, 24 hours.
2. `lakeside-accounts`: `POST /launcher/session`, `GET /launcher/entitlements`,
   `POST /launcher/logout`, authenticated by the device token, returning
   `{ productId: "owned" | "refunded" }`.
3. **Offline grant**: a signed, short-lived entitlement cache (7 to 14 days) so
   a purchased native game boots without the platform.
4. **Launch token**: the game receives a scoped token, never the launcher's
   device token.

## Phase 3: commerce and distribution

1. Presigned artifact URLs or a token-checking proxy. Public GitHub Release
   assets make an entitlement gate cosmetic.
2. Checkout handoff from the launcher, then entitlement refresh on return.
3. Refund and chargeback propagation into the launcher library.
4. Delta updates for large content packs.

## Phase 4: platform features

Cloud saves (AHDClient saves are already versioned JSON envelopes), friends and
presence, crash reporting, beta channels, and per-product launch arguments.

## Open owner decisions

- **Lakeside account id.** Purchases are keyed by `ahd_user_id` or email today.
  A launcher that accepts Discord needs an explicit account-linking policy and
  a migration of the commerce key, or it must require AHD sign-in for anything
  purchasable.
- **Canonical channel.** Several games are free downloads from public GitHub
  repositories. Decide per product whether the launcher becomes the canonical
  distribution path.
- **Signing identity.** One Windows certificate and one Apple Developer
  identity, or the updater cannot be trusted at scale.
