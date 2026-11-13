# Changelog

## 0.6.0

- New look: tabs across the top (Library, Store, Downloads) and an account button,
  in the same colours and type as the Lakeside store. No sidebar.
- Library is a table: art, name, state (Update available, Installed 1.4.2, Play
  in browser, Not installed), size, last played, and one action per row. Filters
  for All, Installed, Updates and Browser, plus search.
- Each game has its own page: Play, Install or Update, the latest three patch
  notes (hidden when there are none), what is installed, add-ons and supporter
  tiers. Open folder, Repair and Uninstall appear greyed out until the launcher
  can do them.
- Margin of Victory is one row for the browser game and the desktop app.
- The Store reads live names, prices, add-ons and supporter tiers from
  lakesidegames.net. Buy opens the store page in your browser. If the store
  cannot be reached it shows the last known prices and says so.
- Downloads tab and a slim bar at the bottom show real progress, speed and time
  left, and queue installs one after another. Pause and resume are not offered
  yet.
- Account page: who you are, how you signed in, purchases, supporter tiers.
- First run signed out: Sign in with Lakeside Games first, other ways beneath,
  and Continue without signing in.
- No News tab: the site has no public feed to read yet.
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
