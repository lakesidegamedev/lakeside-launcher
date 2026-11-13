# Changelog

## Unreleased

- The launcher now builds for macOS (Apple silicon and Intel) and Linux
  (AppImage and .deb). These builds are unsigned; on a Mac, right-click the app
  and choose Open the first time.
- On a Mac, Corporate Warfare downloads as a checked disk image and opens for
  you to drag into Applications.
- Games with no build for your system say so on the tile.

## 0.5.0

- Corporate Warfare can be bought and installed from the launcher. If you own
  it (or have a supporter tier) the tile shows Install, then Update and Play.
  Everyone else sees Buy, which opens the store page. Signed out, it says Sign in
  to install.
- The installer downloads through your Lakeside account, is checked against its
  published checksum before it runs, and is removed if anything looks wrong.
- Mac players are sent to their account page to download Corporate Warfare.
- The Windows sign-in check used by the team now has a time limit on every step,
  saves a screenshot at each step, and no longer stalls when no consent page
  appears on a repeat sign-in.

## 0.4.2

- Windows: sign-in links open with their full address, so sign-in works.

## 0.4.1

- Installs for Inno Setup and AppImage games, paid downloads and the launch
  handoff.
