// End-to-end sign-in check. Drives the launcher webview (CDP 9222) and the
// browser the launcher opens (Edge, CDP 9223). Credentials come from env only.
import { chromium } from "playwright-core";
import fs from "node:fs";

const user = process.env.LAKESIDE_TEST_USERNAME;
const pass = process.env.LAKESIDE_TEST_PASSWORD;
const shots = process.env.SHOT_DIR || "e2e-shots";
fs.mkdirSync(shots, { recursive: true });
if (!user || !pass) throw new Error("test credentials are not set");

const stages = [];
const stage = (name) => {
  stages.push(name);
  console.log(`stage: ${name}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let launcherPage;
let browserCtx;
let browserPage;

async function shoot(page, name) {
  if (!page || page.isClosed()) return;
  try {
    await page.screenshot({ path: `${shots}/${name}.png` });
  } catch (e) {
    console.log(`screenshot ${name} failed: ${e.message}`);
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

async function main() {
  const launcher = await connect(9222);
  stage("connected-launcher");
  for (let i = 0; i < 30 && !launcherPage; i++) {
    for (const ctx of launcher.contexts()) {
      launcherPage = ctx.pages().find((p) => !p.url().startsWith("devtools"));
    }
    if (!launcherPage) await sleep(1000);
  }
  if (!launcherPage) throw new Error("no launcher page");

  const edge = await connect(9223);
  stage("connected-browser");
  browserCtx = edge.contexts()[0];

  const btn = launcherPage.getByRole("button", { name: "Sign in with A House Divided" }).first();
  await btn.waitFor({ timeout: 30000 });
  const before = new Set(browserCtx.pages());
  await btn.click();
  stage("clicked-sign-in");

  // The launcher opens the start URL via the system default browser.
  for (let i = 0; i < 60 && !browserPage; i++) {
    browserPage = browserCtx.pages().find((p) => !before.has(p) && /lakesidegames|ahousedividedgame|127\.0\.0\.1/.test(p.url()));
    if (!browserPage) await sleep(1000);
  }
  if (!browserPage) {
    console.log("browser pages: " + browserCtx.pages().map((p) => p.url()).join(" | "));
    throw new Error("sign-in URL did not arrive in the automated browser");
  }
  stage("browser-received-url");

  await browserPage.waitForURL(/ahousedividedgame\.com/, { timeout: 60000 });
  stage("on-ahd-login");
  const email = browserPage.locator("input#email, input[name=email], input[name=username]").first();
  await email.waitFor({ timeout: 30000 });
  await email.fill(user);
  await browserPage.locator("input[type=password]").first().fill(pass);
  await browserPage.locator("button[type=submit], input[type=submit]").first().click();
  stage("submitted-login");

  // Wait for the loopback callback; click through a consent step if one shows.
  let reached = false;
  for (let i = 0; i < 60; i++) {
    const url = browserPage.isClosed() ? "" : browserPage.url();
    if (/^http:\/\/(127\.0\.0\.1|localhost)/.test(url) || browserPage.isClosed()) {
      reached = true;
      break;
    }
    const consent = browserPage.getByRole("button", { name: /authori[sz]e|allow|continue|approve/i }).first();
    if (await consent.isVisible().catch(() => false)) {
      await consent.click().catch(() => {});
      stage("clicked-consent");
    }
    await sleep(1000);
  }
  await shoot(browserPage, "browser-after-submit");
  if (!reached) throw new Error("browser did not reach the loopback callback");
  stage("loopback-callback");

  const chip = launcherPage.locator(".account-chip strong").first();
  await chip.waitFor({ timeout: 60000 });
  const shown = (await chip.textContent())?.trim() ?? "";
  if (!shown) throw new Error("account chip is empty");
  console.log(`launcher shows a signed-in name; matches test username: ${shown.toLowerCase() === user.toLowerCase()}`);
  stage("launcher-signed-in");

  // Entitlements: open Library, then check no error toast is showing.
  await launcherPage.getByRole("button", { name: "Library" }).first().click();
  await sleep(5000);
  const toast = await launcherPage.locator(".toast").first().textContent({ timeout: 2000 }).catch(() => null);
  await shoot(launcherPage, "launcher-library");
  // The sign-in confirmation toast is expected; anything else is a problem.
  if (toast && !/^\s*Signed in as /.test(toast)) throw new Error(`launcher shows a notice after sign-in: ${toast}`);
  stage("library-clean");
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
