// Linux smoke run of the launcher UI. Serves the built web app, drives every
// tab in headless Chrome at 1280x800, checks the text a player must see, and
// saves a screenshot per screen. Runs in CI after `npm run build:web`.
// Network calls to the site are answered locally so the run is repeatable.
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import fs from "node:fs";

const shots = process.env.SHOT_DIR || "ui-smoke-shots";
fs.mkdirSync(shots, { recursive: true });
const PORT = 4173;
const base = `http://127.0.0.1:${PORT}/`;

const homeFeed = JSON.stringify({
  version: 1,
  slides: [
    {
      id: "smoke-release",
      kind: "release",
      game: "cw",
      headline: "Corporate Warfare 2.0 is out",
      line: "$14.99, or included with Supporter+.",
      art: "bundled",
      action: { type: "store", target: "/store/corporate-warfare" },
      starts: "2020-01-01T00:00:00Z",
      ends: "2099-01-01T00:00:00Z",
      priority: 1,
    },
    {
      id: "smoke-free",
      kind: "free",
      game: "ahd",
      headline: "Everything is free to play while A House Divided is paused",
      line: "Every Lakeside game is open to everyone while the pause lasts.",
      art: "bundled",
      action: { type: "store", target: "/store" },
      starts: "2020-01-01T00:00:00Z",
      ends: "2099-01-01T00:00:00Z",
      priority: 2,
    },
  ],
});

const server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--host", "127.0.0.1", "--strictPort"], {
  stdio: "inherit",
});
const failures = [];
function check(ok, what) {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failures.push(what);
}
async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try {
      if ((await fetch(base)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("preview server did not start");
}

try {
  await waitForServer();
  const browser = await chromium.launch({ channel: "chrome" });

  async function open(init) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    const cors = { "access-control-allow-origin": "*" };
    await page.route("**/download/launcher/home.json", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", headers: cors, body: homeFeed }));
    await page.route("**/account/api/free-access", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", headers: cors, body: '{"on":true}' }));
    await page.route("**/account/api/catalog", (r) => r.abort());
    if (init) await page.addInitScript(init);
    await page.goto(base);
    await page.waitForSelector("header.top", { timeout: 15000 });
    return page;
  }
  const shot = (page, name) => page.screenshot({ path: `${shots}/${name}.png` });
  const text = async (page) => (await page.locator("body").innerText()).replace(/\s+/g, " ");

  let page = await open();
  await page.waitForSelector(".hm-car", { timeout: 15000 });
  let body = await text(page);
  check(await page.locator("nav.tabs .tab").first().innerText() === "Home", "Home is the first tab");
  check(await page.locator("nav.tabs .tab.on").innerText() === "Home", "Home is the default screen");
  check(body.includes("Corporate Warfare 2.0 is out"), "Home carousel shows the first slide");
  check(body.includes("Continue playing"), "Home lists Continue playing");
  await page.locator(".hm-arrow[aria-label='Next slide']").click();
  check((await text(page)).includes("Everything is free to play while A House Divided is paused"), "free-to-play slide shows while the switch is on");
  await shot(page, "home");

  await page.locator("nav.tabs .tab", { hasText: "Library" }).click();
  await page.waitForSelector("table");
  body = await text(page);
  check(body.includes("A House Divided") && body.includes("Margin of Victory"), "Library lists the games");
  await shot(page, "library");

  await page.locator("table tbody tr").first().locator("b").first().click();
  await page.waitForTimeout(300);
  body = await text(page);
  check(body.includes("Where you can play"), "Game page opens");
  check(/Reinstall|Open folder/.test(body), "Game page offers folder and reinstall controls");
  await shot(page, "game");

  await page.locator("nav.tabs .tab", { hasText: "Store" }).click();
  await page.waitForTimeout(300);
  body = await text(page);
  check(body.includes("Support the studio") && body.includes("Champion"), "Store shows the three supporter tiers");
  check(body.includes("$3.00 / month") && body.includes("$9.99 / month") && body.includes("$20.00 / month"), "Store shows the tier prices");
  await shot(page, "store");

  await page.locator("nav.tabs .tab", { hasText: "Downloads" }).click();
  await page.waitForTimeout(300);
  check((await text(page)).includes("Where files go"), "Downloads screen opens");
  await shot(page, "downloads");

  await page.locator("button.acct").click();
  await page.waitForTimeout(300);
  check((await text(page)).includes("demo-player"), "Account screen opens");
  await shot(page, "account");
  await page.context().close();

  page = await open(() => localStorage.setItem("lakeside.launcher.session", "signed-out"));
  await page.waitForTimeout(500);
  check((await text(page)).includes("Sign in with Lakeside Games"), "Signed-out first run shows the sign-in screen");
  await shot(page, "signin");

  await browser.close();
} finally {
  server.kill();
}
if (failures.length > 0) {
  console.error(`${failures.length} check(s) failed`);
  process.exit(1);
}
console.log("ui smoke passed");
