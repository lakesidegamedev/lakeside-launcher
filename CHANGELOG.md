# Changelog

## 0.7.3

- Internal preview polish. Nothing changes for players.

## 0.7.2

- Groundwork for an internal preview. Nothing changes for players: no new game, tile or page appears, and free access works as before.

## 0.7.1

- Grand Century installs and starts. The launcher looked for the wrong program
  name; the real one is `grandcentury-desktop.exe` in your Local AppData folder.
  Games are now found through their own uninstall entry first (current user and
  all users), with the known folder as the fallback, so a copy you installed
  yourself still shows Play. Grand Century always offers Play in browser too.
- Uninstall waits for the game's uninstaller to really finish before the game
  disappears from the list. Saves are never touched.
- Paid downloads ignore platforms this launcher does not know. A Linux .deb and
  a Mac disk image show as Download: the file is checked, saved to Downloads and
  its folder opens.
- New automatic check, "game install e2e (paid and free)": installs Corporate
  Warfare and Grand Century from the launcher on Windows and Linux, plays them,
  and uninstalls them. Test builds can write a small log of install and sign-in
  handoff steps when told to; it never contains a code or a password.

## 0.7.0

- New Home. A full-bleed showcase of what is new, with one large action and a
  quiet second one per slide, key art built from real screenshots, and a thin
  progress bar. The art drifts slowly and the text rises in; hover, keyboard
  focus and a hidden window hold it still, and reduced motion turns all of it
  off. Left and Right change slide, Enter runs the main action.
- Two layouts, chosen from the feed. While a live event is on (a countdown, an
  offer or the free weekend) Home shows the showcase with one or two live panels
  beside it. With no live event it shows the showcase with a strip of five
  labelled tiles under it. The switch happens by itself when an event starts or
  its end time passes, with no restart.
- Live events come from a new `events` list in the home feed. Events outside
  their window are ignored even if the feed still lists them. The free-weekend
  event also needs the store's live free-access answer to be on, and it takes
  its end time from that answer, so Home never advertises free access the store
  is not giving. Feeds without `events` keep working.
- The main button follows your machine: Install, Update or Play, falling back to
  the store page when the game is not available to you.
- Below the showcase: Jump back in (wide tiles with art, last played, Play or
  Update), What changed (game, version, date and one sentence from the release
  notes; version and date only when the notes have no clean sentence) and a small
  account strip.
- The feed can name any of the five built-in plates or point at an image on
  lakesidegames.net to override one. Slide text, buttons, kicker, version badge
  and picture focus are all feed fields; unknown fields are ignored.
- The Update-ready slide is gone from the showcase. Updates show in Jump back in.

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
