# Launcher roadmap

Status after 0.3.2. The launcher now updates itself, installs AHDClient from a
signed manifest, and signs in to the live Lakeside account services.

## Shipped

1. **Signed updater**: Tauri updater, minisign key, installer in passive mode,
   public feed at `https://lakesidegames.net/download/launcher/latest.json`.
   Verified in CI by installing 0.3.1 and updating it to 0.3.2 in place.
2. **Signed game manifest**: `manifest.json` plus a detached Ed25519 signature,
   generated from GitHub Releases and verified in Rust before parsing.
3. **Game install/update**: AHDClient downloads from the manifest, sha256 is
   checked against the digest, the NSIS installer runs silently, and the
   executable is verified under `%LOCALAPPDATA%\AHDClient`.
4. **Live identity**: Discord sign-in through lakeside-auth, with a narrow
   loopback allowance (`127.0.0.1:47832-47841/callback`).
5. **Live entitlements**: lakeside-accounts issues a 30-day opaque portal
   session and serves purchase entitlements as a Bearer API. The launcher keeps
   the token in Rust with 0600 permissions, never in the webview.
6. **Library, store, account UI**, real game art, installation progress and
   one-click updates.

## Remaining

1. **Windows code signing.** The workflow is ready: set `WINDOWS_CERTIFICATE`
   and `WINDOWS_CERTIFICATE_PASSWORD` and the installer and portable exe are
   signed, timestamped and verified. The certificate itself is the remaining
   input, so SmartScreen still warns until it is provided.
2. **Paid artifact protection.** Native release artifacts currently point at
   public GitHub release URLs. If a paid native game ever ships, its download
   needs a presigned URL or a token-checking proxy. The entitlement gate is
   cosmetic otherwise.
3. **In-launcher checkout.** Checkout opens the existing account page in the
   browser. An embedded, zero-capability checkout window is possible but not
   required for correctness.
4. **Game updates without reinstall.** The detail sheet offers Update, which
   runs the vendor installer again. Delta updates and rollback are not built.
5. **macOS and Linux installs.** Automatic install is Windows-only; those
   builds launch from `LAKESIDE_INSTALL_ROOT` but are installed manually.
6. **Cloud saves, friends and presence.** AHDClient saves are versioned JSON
   and are the natural next sync unit.

## Owner decisions

- **Signing identity.** One Windows certificate and one Apple Developer
  identity, or the updater stays unsigned and warns.
- **Canonical channel.** Several games are free downloads from public GitHub
  repositories. Decide per product whether the launcher becomes the canonical
  distribution path.
- **Account key.** The launcher uses the unified portal session: AHD ids for
  AHD sign-in, `discord:<id>` plus email for Discord purchases. Explicit
  account linking across providers is still not built.
