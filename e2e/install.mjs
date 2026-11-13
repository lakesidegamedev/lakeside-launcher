// Game install end-to-end check on Windows. Drives the launcher webview (CDP
// 9222) and the browser it opens for sign-in (Edge, CDP 9223), then installs,
// starts and uninstalls real games from the launcher UI.
//
// The launcher writes the checksum, installer, handoff and spawn steps to the
// file named by LAKESIDE_E2E_LOG (never a code or a token). Credentials come
// from env only. Every stage has its own deadline and leaves a screenshot, on
// success and on failure.
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const user = process.env.LAKESIDE_TEST2_USERNAME;
const pass = process.env.LAKESIDE_TEST2_PASSWORD;
const shots = process.env.SHOT_DIR || "e2e-shots";
const logFile = process.env.LAKESIDE_E2E_LOG;
const wanted = (process.env.GAMES || "corporate-warfare,grand-century").split(",").map((s) => s.trim()).filter(Boolean);
fs.mkdirSync(shots, { recursive: true });
if (!user || !pass) throw new Error("test credentials are not set");
if (!logFile) throw new Error("LAKESIDE_E2E_LOG is not set");

const LOCAL = process.env.LOCALAPPDATA;
const ROAMING = process.env.APPDATA;
const DOCS = path.join(process.env.USERPROFILE, "Documents");

const GAMES = {
  "corporate-warfare": {
    title: "Corporate Warfare",
    id: "corporate-warfare",
    client: "corporate-warfare-desktop",
    exeName: /^Corporate Warfare\.exe$/i,
    installDir: path.join(LOCAL, "Programs", "Corporate Warfare"),
    registry: "Corporate Warfare",
    versionPrefix: "2.",
  },
  "grand-century": {
    title: "Grand Century",
    id: "grand-century-desktop",
    client: null,
    exeName: /^grandcentury-desktop\.exe$/i,
    installDir: path.join(LOCAL, "GrandCentury"),
    registry: "Grand ?Century",
    versionPrefix: "1.",
  },
  "urban-sprawl": {
    title: "Urban Sprawl",
    id: "urban-sprawl",
    client: "urban-sprawl-desktop",
    exeName: /^urban-sprawl\.exe$/i,
    installDir: path.join(LOCAL, "Programs", "Urban Sprawl"),
    registry: "Urban Sprawl",
    versionPrefix: "1.",
    publisher: "Lakeside Games",
    displayNameStart: "Urban Sprawl",
  },
};

const stages = [];
let stageNumber = 0;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let launcherPage;
let browserCtx;
let browserPage;

function ps(script) {
  return execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8",
    timeout: 120000,
  }).trim();
}

async function shoot(page, name) {
  if (!page || page.isClosed()) return;
  try {
    await page.screenshot({ path: `${shots}/${name}.png`, timeout: 10000 });
  } catch (e) {
    console.log(`screenshot ${name} failed: ${e.message}`);
  }
}

/** Whole-screen capture, so the game window itself is in the picture. */
function screen(name) {
  try {
    ps(`Add-Type -AssemblyName System.Windows.Forms,System.Drawing; $b=[System.Windows.Forms.SystemInformation]::VirtualScreen; $bmp=New-Object System.Drawing.Bitmap $b.Width,$b.Height; $g=[System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($b.Location,[System.Drawing.Point]::Empty,$b.Size); $bmp.Save('${path.resolve(shots, name + ".png").replace(/'/g, "''")}'); $g.Dispose(); $bmp.Dispose()`);
  } catch (e) {
    console.log(`screen ${name} failed: ${String(e.message).split("\n")[0]}`);
  }
}

async function stage(name, ms, run, where = () => launcherPage) {
  stageNumber += 1;
  const label = `${String(stageNumber).padStart(2, "0")}-${name}`;
  console.log(`stage: ${name} (limit ${Math.round(ms / 1000)}s)`);
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`stage "${name}" timed out after ${Math.round(ms / 1000)}s`)), ms);
  });
  try {
    const result = await Promise.race([run(), deadline]);
    stages.push(name);
    await shoot(where(), `${label}-ok`);
    return result;
  } catch (e) {
    await shoot(where(), `${label}-FAILED`);
    screen(`${label}-FAILED-screen`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function connect(port, tries = 10) {
  let last = "";
  for (let i = 0; i < tries; i++) {
    try {
      const info = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
      return await chromium.connectOverCDP(info.webSocketDebuggerUrl);
    } catch (e) {
      last = String(e.message).split("\n")[0];
      await sleep(2000);
    }
  }
  throw new Error(`could not connect to CDP port ${port}: ${last}`);
}

const isLoopback = (url) => /^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url);
const CONSENT_NAMES = ["Authorize", "Allow", "Approve"];

async function consentButton(page) {
  for (const name of CONSENT_NAMES) {
    const button = page.getByRole("button", { name, exact: true }).first();
    if (await button.isVisible().catch(() => false)) return button;
  }
  return null;
}

async function waitForConsentOrCallback() {
  let clicked = false;
  for (;;) {
    const url = browserPage.isClosed() ? "" : browserPage.url();
    if (browserPage.isClosed() || isLoopback(url)) return clicked ? "consent-then-callback" : "callback-without-consent";
    if (!clicked) {
      const button = await consentButton(browserPage);
      if (button) {
        await shoot(browserPage, "consent-page");
        await button.click().catch(() => {});
        clicked = true;
      }
    }
    await sleep(500);
  }
}

// ----------------------------------------------------------------- log + OS

const logText = () => (fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8") : "");
const logLinesAfter = (offset) => logText().slice(offset).split("\n").filter(Boolean);
const logOffset = () => logText().length;

async function waitForLog(pattern, offset, ms, what) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const hit = logLinesAfter(offset).find((line) => pattern.test(line));
    if (hit) return hit;
    await sleep(1000);
  }
  throw new Error(`launcher log never showed ${what}. Log so far:\n${logLinesAfter(offset).join("\n") || "(empty)"}`);
}

function registryEntries(pattern) {
  const out = ps(
    `$keys='HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'; ` +
      `Get-ItemProperty $keys -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -match '${pattern}' } | ` +
      `Select-Object @{n='key';e={$_.PSChildName}},DisplayName,Publisher,DisplayVersion,InstallLocation,DisplayIcon,UninstallString | ConvertTo-Json -Compress`,
  );
  if (!out) return [];
  const parsed = JSON.parse(out);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function pidAlive(pid) {
  return ps(`if (Get-Process -Id ${pid} -ErrorAction SilentlyContinue) { 'yes' } else { 'no' }`) === "yes";
}

function topLevelDirs() {
  const dirs = new Set();
  for (const base of [LOCAL, ROAMING, DOCS]) {
    if (!fs.existsSync(base)) continue;
    for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
      if (entry.isDirectory()) dirs.add(path.join(base, entry.name));
    }
  }
  return dirs;
}

// ------------------------------------------------------------------- the UI

async function openGamePage(g) {
  await launcherPage.getByRole("button", { name: "Library" }).first().click();
  const row = launcherPage.locator("table.lib tr").filter({ hasText: g.title }).first();
  await row.waitFor({ timeout: 20000 });
  await row.locator("button.rowlink").first().click();
  await launcherPage.locator("h1", { hasText: g.title }).first().waitFor({ timeout: 15000 });
}

const primary = () => launcherPage.locator(".gamehead .actions .btn.p").first();
const primaryText = async () => ((await primary().textContent({ timeout: 5000 }).catch(() => "")) ?? "").trim();
const stateText = async () => ((await launcherPage.locator(".gamehead .state.inline").first().textContent({ timeout: 5000 }).catch(() => "")) ?? "").trim();

async function main() {
  await stage("connect-launcher", 60000, async () => {
    const connection = await connect(9222);
    for (let i = 0; i < 30 && !launcherPage; i++) {
      for (const ctx of connection.contexts()) {
        launcherPage = ctx.pages().find((p) => !p.url().startsWith("devtools"));
      }
      if (!launcherPage) await sleep(1000);
    }
    if (!launcherPage) throw new Error("no launcher page");
  });
  await stage("connect-browser", 60000, async () => {
    const edge = await connect(9223);
    browserCtx = edge.contexts()[0];
  });

  const before = new Set(browserCtx.pages());
  await stage("click-sign-in", 45000, async () => {
    const btn = launcherPage.getByRole("button", { name: "Sign in with Lakeside Games" }).first();
    await btn.waitFor({ timeout: 30000 });
    await btn.click();
  });
  await stage("browser-receives-url", 60000, async () => {
    while (!browserPage) {
      browserPage = browserCtx.pages().find((p) => !before.has(p) && /lakesidegames|ahousedividedgame|127\.0\.0\.1/.test(p.url()));
      if (!browserPage) await sleep(500);
    }
  }, () => browserPage ?? launcherPage);
  await stage("ahd-login-page", 60000, async () => {
    await browserPage.waitForURL(/ahousedividedgame\.com/, { timeout: 55000 });
    await browserPage.locator("input#email, input[name=email], input[name=username]").first().waitFor({ timeout: 30000 });
  }, () => browserPage);
  await stage("submit-login", 45000, async () => {
    await browserPage.locator("input#email, input[name=email], input[name=username]").first().fill(user);
    await browserPage.locator("input[type=password]").first().fill(pass);
    await browserPage.locator("button[type=submit], input[type=submit]").first().click();
  }, () => browserPage);
  const route = await stage("consent-or-callback", 90000, waitForConsentOrCallback, () => browserPage);
  console.log(`sign-in path: ${route}`);
  await stage("launcher-signed-in", 60000, async () => {
    const chip = launcherPage.locator("button.acct .acct-name").first();
    await chip.waitFor({ timeout: 55000 });
    const shown = ((await chip.textContent()) ?? "").trim();
    if (!shown) throw new Error("account chip is empty");
    console.log(`signed in as the second test account: ${shown.toLowerCase() === user.toLowerCase()}`);
  });

  const free = await (await fetch("https://lakesidegames.net/account/api/free-access")).json().catch(() => ({}));
  console.log(`free access: ${free.on === true ? "on until " + free.endsAt : "off"}`);

  for (const key of wanted) {
    const g = GAMES[key];
    if (!g) throw new Error(`unknown game ${key}`);
    await playThrough(key, g);
  }
}

async function playThrough(key, g) {
  await stage(`${key}-game-page`, 60000, () => openGamePage(g));

  const baselineDirs = topLevelDirs();
  await stage(`${key}-offers-install`, 75000, async () => {
    if (fs.existsSync(g.installDir) && fs.readdirSync(g.installDir).some((f) => g.exeName.test(f))) {
      throw new Error(`${g.title} is already installed on this runner at ${g.installDir}`);
    }
    // The release lookup runs first and the button reads "Checking..." meanwhile.
    let label = await primaryText();
    for (let i = 0; i < 30 && /^Checking/.test(label); i++) {
      await sleep(2000);
      label = await primaryText();
    }
    console.log(`${g.title} primary action before install: "${label}"`);
    if (label !== "Install") throw new Error(`expected Install, the page offers "${label}"`);
    const playInBrowser = await launcherPage.getByRole("button", { name: "Play in browser" }).count();
    console.log(`${g.title} offers Play in browser: ${playInBrowser > 0}`);
    if (key === "grand-century" && playInBrowser === 0) throw new Error("Grand Century must always offer Play in browser");
  });

  const offset = logOffset();
  await stage(`${key}-install`, 600000, async () => {
    await primary().click();
    await sleep(4000);
    await shoot(launcherPage, `${key}-installing`);
    const end = Date.now() + 570000;
    for (;;) {
      const state = await stateText();
      if (/^Installed /.test(state)) {
        console.log(`${g.title} state: ${state}`);
        break;
      }
      const notice = await launcherPage.locator(".toast").first().textContent({ timeout: 1000 }).catch(() => null);
      if (notice && /could not|did not|failed|not found|sign in|no verified|coming|reported/i.test(notice)) {
        throw new Error(`install failed in the launcher: ${notice.trim()}`);
      }
      if (Date.now() > end) throw new Error(`still not installed; state "${state}", button "${await primaryText()}"`);
      await sleep(2000);
    }
  });

  const version = await stage(`${key}-verify-install`, 120000, async () => {
    const checksum = await waitForLog(new RegExp(`checksum ok product=${g.id}`), offset, 5000, "the checksum step");
    const finished = await waitForLog(new RegExp(`installer finished product=${g.id} .*ok=true`), offset, 5000, "the installer finishing");
    console.log(`log: ${checksum}\nlog: ${finished}`);
    const label = await primaryText();
    if (label !== "Play") throw new Error(`after install the page offers "${label}", expected Play`);
    const state = await stateText();
    const shown = state.replace(/^Installed /, "");
    if (!shown.startsWith(g.versionPrefix)) throw new Error(`installed version "${shown}" does not look like ${g.versionPrefix}x`);
    const exe = fs.existsSync(g.installDir) ? fs.readdirSync(g.installDir).find((f) => g.exeName.test(f)) : null;
    if (!exe) throw new Error(`no program matching ${g.exeName} in ${g.installDir}`);
    const entries = registryEntries(g.registry);
    console.log(`registry entries for ${g.title}: ${JSON.stringify(entries)}`);
    if (entries.length === 0) throw new Error("the setup registered no uninstall entry");
    if (g.displayNameStart && !String(entries[0].DisplayName).startsWith(g.displayNameStart)) {
      throw new Error(`uninstall DisplayName "${entries[0].DisplayName}" does not start with "${g.displayNameStart}"`);
    }
    if (g.publisher && entries[0].Publisher !== g.publisher) {
      throw new Error(`uninstall Publisher "${entries[0].Publisher}" is not "${g.publisher}"`);
    }
    const registered = entries[0].DisplayVersion;
    if (registered && registered !== shown) throw new Error(`launcher says ${shown}, registry says ${registered}`);
    return shown;
  });

  const playOffset = logOffset();
  const pid = await stage(`${key}-play`, 120000, async () => {
    await primary().click();
    const spawn = await waitForLog(/spawn pid=\d+/, playOffset, 30000, "the game being started");
    const started = Number(/pid=(\d+)/.exec(spawn)[1]);
    if (g.client) {
      const call = await waitForLog(new RegExp(`handoff client=${g.client} status=200`), playOffset, 5000, "a 200 handoff call");
      const got = await waitForLog(new RegExp(`handoff client=${g.client} code_received=true`), playOffset, 5000, "a handoff code");
      console.log(`log: ${call}\nlog: ${got}`);
    }
    // 20 seconds up, checked every 2 seconds, with a picture of the screen halfway.
    for (let t = 0; t < 20; t += 2) {
      if (!pidAlive(started)) throw new Error(`${g.title} exited ${t}s after it was started`);
      if (t === 8) screen(`${key}-running-screen`);
      await sleep(2000);
    }
    if (!pidAlive(started)) throw new Error(`${g.title} was not running after 20 seconds`);
    console.log(`${g.title} still running after 20 seconds (pid ${started})`);
    return started;
  });

  await stage(`${key}-stop-game`, 60000, async () => {
    ps(`Stop-Process -Id ${pid} -Force -ErrorAction SilentlyContinue; Get-Process | Where-Object { $_.Path -like '${g.installDir.replace(/'/g, "''")}*' } | Stop-Process -Force -ErrorAction SilentlyContinue`);
    await sleep(2000);
  });

  // Saves must survive. The game's own data folders did not exist before it
  // ran; put a marker file in each and check they are all still there later.
  const sentinels = [];
  await stage(`${key}-plant-save-markers`, 60000, async () => {
    for (const dir of topLevelDirs()) {
      if (baselineDirs.has(dir)) continue;
      if (path.resolve(dir).toLowerCase() === path.resolve(g.installDir).toLowerCase()) continue;
      if (/^Programs$/i.test(path.basename(dir))) continue;
      const file = path.join(dir, "e2e-saves-marker.txt");
      try {
        fs.writeFileSync(file, "launcher e2e marker: uninstall must not remove this\n");
        sentinels.push(file);
      } catch {
        // not writable: skip
      }
    }
    // Always have one marker in a place a game could plausibly keep saves.
    const documentsMarker = path.join(ROAMING, `e2e-${key}-saves-marker.txt`);
    fs.writeFileSync(documentsMarker, "marker\n");
    sentinels.push(documentsMarker);
    console.log(`markers planted: ${sentinels.map((f) => path.relative(process.env.USERPROFILE, f)).join(", ")}`);
  });

  await stage(`${key}-uninstall`, 300000, async () => {
    await openGamePage(g);
    await launcherPage.getByRole("button", { name: "Uninstall", exact: true }).first().click();
    await launcherPage.getByRole("button", { name: "Confirm uninstall" }).first().click();
    const end = Date.now() + 270000;
    for (;;) {
      if ((await primaryText()) === "Install") break;
      if (Date.now() > end) throw new Error(`still showing "${await primaryText()}" after uninstall`);
      await sleep(2000);
    }
  });

  await stage(`${key}-verify-uninstall`, 120000, async () => {
    // The uninstaller finishes in the background; give it a moment, then check the disk.
    const end = Date.now() + 90000;
    const gone = () => !(fs.existsSync(g.installDir) && fs.readdirSync(g.installDir).some((f) => g.exeName.test(f)));
    while (!gone() && Date.now() < end) await sleep(2000);
    if (!gone()) throw new Error(`the program is still in ${g.installDir}`);
    const entries = registryEntries(g.registry);
    if (entries.length) throw new Error(`the uninstall entry is still registered: ${JSON.stringify(entries)}`);
    const missing = sentinels.filter((f) => !fs.existsSync(f));
    if (missing.length) throw new Error(`uninstall removed saves markers: ${missing.join(", ")}`);
    console.log(`${g.title} removed; ${sentinels.length} saves markers untouched`);
    const text = (await launcherPage.locator(".toast").first().textContent({ timeout: 1000 }).catch(() => "")) ?? "";
    console.log(`launcher notice: ${text.trim()}`);
  });
}

try {
  await main();
  console.log("PASS stages: " + stages.join(" > "));
} catch (e) {
  console.error(`FAIL after stages: ${stages.join(" > ")}`);
  console.error(String(e.message).split(pass).join("***"));
  await shoot(launcherPage, "launcher-failure");
  await shoot(browserPage, "browser-failure");
  screen("failure-screen");
  console.error("launcher log:\n" + logText());
  process.exit(1);
}
console.log("launcher log:\n" + logText());
process.exit(0);
