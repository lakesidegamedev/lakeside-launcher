# Changelog

## 0.6.1

- Free weekend: while the studio free-access switch is on, signed-in players see
  "Free until Monday 5:00 PM Eastern" (read from the end time the site gives) in
  the Library, on the game page and in the Store. Paid games show Install or
  Play instead of Buy. When the switch is off, nothing about it shows.
- Home: "Recently updated" shows a sentence from the release notes, not a heading.
- Tier wording: the sample Home slide now says Corporate Warfare is included with
  Supporter+, not any tier.

## 0.6.0

- New look: tabs across the top (Home, Library, Store, Downloads) and an account
  button, in the same colours and type as the Lakeside store. No sidebar.
- Home is the first screen. A carousel shows what is new (releases, updates for
  games you have, news), then Continue playing and Recently updated. It reads a
  small feed from lakesidegames.net and falls back to built-in slides when you
  are offline. The "free to play" slide shows only while free access is on.
- Library is a table: art, name, state (Update available, Installed 1.4.2, Play
  in browser, Not installed), size, last played, and one action per row. Filters
  for All, Installed, Updates and Browser, plus search.
- Each game has its own page: Play, Install or Update, the latest three patch
  notes (hidden when there are none), what is installed, add-ons and supporter
  tiers.
- Open folder, Reinstall and Uninstall now work on Windows and Linux. Uninstall
  asks first, runs the game's own uninstaller when it has one, and never touches
  your saves. Reinstall downloads the published installer again, checks it
  against its checksum and runs it over the current install.
- Downloads shows where games go and lets you pick another install folder for
  new installs (it must be empty of installed games first).
- Margin of Victory is one row for the browser game and the desktop app, and
  uses its new address on lakesidegames.net. Grand Century shows a desktop app
  option once a desktop release exists; until then it stays Play in browser.
- Supporter tiers (Supporter, Supporter+, Champion) are described as the live
  store describes them. Offline, the launcher shows the latest wording it knows.
- The Store reads live names, prices, add-ons and tiers from lakesidegames.net.
  Buy opens the store page in your browser.
- Downloads tab and a slim bar at the bottom show real progress, speed and time
  left, and queue installs one after another. Pause and resume are not offered
  yet.
- Account page: who you are, how you signed in, purchases, supporter tiers.
- First run signed out: Sign in with Lakeside Games first, other ways beneath,
  and Continue without signing in.
- Corporate Warfare and the Margin of Victory desktop app start already signed
  in when you play them from the launcher.
- The launcher now builds for macOS (Apple silicon and Intel) and Linux
  (AppImage and .deb). These builds are unsigned; on a Mac, right-click the app
  and choose Open the first time. On a Mac, Corporate Warfare downloads as a
  checked disk image and opens for you to drag into Applications. Open folder,
  Uninstall and the install folder setting are not offered on a Mac.
- No News tab: the site has no public feed to read yet.

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
