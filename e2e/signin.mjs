// End-to-end sign-in check. Drives the launcher webview (CDP 9222) and the
// browser the launcher opens (Edge, CDP 9223). Credentials come from env only.
//
// Every stage has its own deadline and leaves a screenshot, on success and on
// failure, so a stuck run says where it stuck instead of timing out silently.
import { chromium } from "playwright-core";
import fs from "node:fs";

const user = process.env.LAKESIDE_TEST_USERNAME;
const pass = process.env.LAKESIDE_TEST_PASSWORD;
const shots = process.env.SHOT_DIR || "e2e-shots";
fs.mkdirSync(shots, { recursive: true });
if (!user || !pass) throw new Error("test credentials are not set");

const stages = [];
let stageNumber = 0;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let launcherPage;
let browserCtx;
let browserPage;

async function shoot(page, name) {
  if (!page || page.isClosed()) return;
  try {
    await page.screenshot({ path: `${shots}/${name}.png`, timeout: 10000 });
  } catch (e) {
    console.log(`screenshot ${name} failed: ${e.message}`);
  }
}

/**
 * Run one stage with its own deadline. A screenshot of the page returned by
 * `where()` is taken when the stage ends, pass or fail.
 */
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
      if (i === 0) console.log(`cdp ${port}: ${info.Browser}`);
      return await chromium.connectOverCDP(info.webSocketDebuggerUrl);
    } catch (e) {
      last = String(e.message).split("\n")[0];
      if (i % 5 === 0) console.log(`cdp ${port} attempt ${i}: ${last}`);
      await sleep(2000);
    }
  }
  throw new Error(`could not connect to CDP port ${port}: ${last}`);
}

const isLoopback = (url) => /^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url);

// The only thing this script ever clicks on a consent page: a button whose
// accessible name is exactly one of these. Nothing else, no fuzzy matching.
const CONSENT_NAMES = ["Authorize", "Allow", "Approve"];

async function consentButton(page) {
  for (const name of CONSENT_NAMES) {
    const button = page.getByRole("button", { name, exact: true }).first();
    if (await button.isVisible().catch(() => false)) return button;
  }
  return null;
}

/**
 * A repeat sign-in often shows no consent page at all. Wait for whichever
 * comes first: the consent button (click it once) or the loopback callback.
 */
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
        console.log("clicked the consent button once");
      }
    }
    await sleep(500);
  }
}

async function cardFor(title) {
  const card = launcherPage.locator("tr").filter({ has: launcherPage.locator("b", { hasText: title }) }).first();
  await card.waitFor({ timeout: 15000 });
  return card;
}

async function main() {
  const launcher = await stage("connect-launcher", 60000, async () => {
    const connection = await connect(9222);
    for (let i = 0; i < 30 && !launcherPage; i++) {
      for (const ctx of connection.contexts()) {
        launcherPage = ctx.pages().find((p) => !p.url().startsWith("devtools"));
      }
      if (!launcherPage) await sleep(1000);
    }
    if (!launcherPage) throw new Error("no launcher page");
    return connection;
  });
  void launcher;

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

  // The launcher opens the start URL via the system default browser.
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

  const path = await stage("consent-or-callback", 90000, waitForConsentOrCallback, () => browserPage);
  console.log(`sign-in path: ${path}`);

  await stage("launcher-signed-in", 60000, async () => {
    const chip = launcherPage.locator("button.acct .acct-name").first();
    await chip.waitFor({ timeout: 55000 });
    const shown = (await chip.textContent())?.trim() ?? "";
    if (!shown) throw new Error("account chip is empty");
    console.log(`launcher shows a signed-in name; matches test username: ${shown.toLowerCase() === user.toLowerCase()}`);
  });

  await stage("library-clean", 30000, async () => {
    await launcherPage.getByRole("button", { name: "Library" }).first().click();
    await sleep(4000);
    const toast = await launcherPage.locator(".toast").first().textContent({ timeout: 2000 }).catch(() => null);
    // The sign-in confirmation toast is expected; anything else is a problem.
    if (toast && !/^\s*Signed in as /.test(toast)) throw new Error(`launcher shows a notice after sign-in: ${toast}`);
  });

  // lakesidetest1 owns nothing. With free access off, Corporate Warfare must offer Buy, never Install.
  // With the free weekend on, the same account must see "Free until ..." and no Buy.
  await stage("paid-product-shows-buy", 45000, async () => {
    const free = await (await fetch("https://lakesidegames.net/account/api/free-access")).json().catch(() => ({}));
    const freeOn = free.on === true && (!free.endsAt || Date.parse(free.endsAt) > Date.now());
    console.log(`free access: ${freeOn ? "on" : "off"}`);
    await launcherPage.getByRole("button", { name: "Store", exact: true }).first().click();
    const card = await cardFor("Corporate Warfare");
    const text = (await card.textContent()) ?? "";
    await shoot(launcherPage, "10a-store-tab");
    if (freeOn) {
      if (!/Free until/.test(text) && !/Free for now/.test(text)) throw new Error("free access is on but the Store shows no Free until text");
      if (await card.getByRole("button", { name: /^Buy/ }).count()) throw new Error("free access is on but the Store still offers Buy");
      const library = await launcherPage.getByRole("button", { name: "Library" }).first();
      await library.click();
      await sleep(1000);
      const row = launcherPage.locator("table.lib tr").filter({ hasText: "Corporate Warfare" });
      if (!(await row.count())) throw new Error("free access is on but Corporate Warfare is not in the Library");
      const rowText = (await row.first().textContent()) ?? "";
      if (!/Free until|Free for now/.test(rowText)) throw new Error("Library row has no Free until text");
      // Corporate Warfare shows "Coming tonight" when the account release lookup returns nothing for a
      // player who owns it only through free access; the check is that Buy never shows and that
      // A House Divided, the other paid game, offers Install or Play.
      if (await row.first().getByRole("button", { name: /^Buy/ }).count()) throw new Error("Library row offers Buy during free access");
      const ahd = launcherPage.locator("table.lib tr").filter({ hasText: "A House Divided" }).first();
      if (!(await ahd.getByRole("button", { name: /^(Install|Play)/ }).count())) throw new Error("A House Divided offers neither Install nor Play during free access");
      console.log(`Corporate Warfare library action: ${((await row.first().getByRole("button").last().textContent()) ?? "").trim()}`);
      return;
    }
    const action = card.getByRole("button").first();
    const label = (await action.textContent())?.trim() ?? "";
    console.log(`Corporate Warfare tile action: ${label}`);
    if (label !== "Buy") throw new Error(`expected Buy on the Corporate Warfare tile, saw "${label}"`);
    if (await card.getByRole("button", { name: /^Install/ }).count()) throw new Error("Corporate Warfare offers Install to an account without it");
    const library = await launcherPage.getByRole("button", { name: "Library" }).first();
    await library.click();
    await sleep(1000);
    if (await launcherPage.locator("table.lib tr").filter({ hasText: "Corporate Warfare" }).count()) {
      throw new Error("Corporate Warfare is in the library of an account without it");
    }
    // The staff-only preview must leave no trace for an account without its grant.
    if (/Urban Sprawl/i.test((await launcherPage.locator("body").innerText()) ?? "")) {
      throw new Error("a staff-only preview shows up for an account without it");
    }
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
  process.exit(1);
}
process.exit(0);
