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

const slide = (id, game, headline, extra = {}) => ({
  id,
  kind: "release",
  game,
  headline,
  line: "A line of text.",
  art: "bundled",
  action: { type: "store", target: "/store/corporate-warfare", label: "Open store page" },
  starts: "2020-01-01T00:00:00Z",
  ends: "2099-01-01T00:00:00Z",
  priority: 1,
  ...extra,
});
const slides = [
  slide("smoke-release", "cw", "Corporate Warfare 2.0 is out", { badge: "2.0", kicker: "Out now" }),
  slide("smoke-mov", "mov", "121 elections in 14 countries", { priority: 2, tile: "121 elections" }),
  slide("smoke-free", "studio", "Everything is free to play", { kind: "free", priority: 3, tile: "Free this weekend", art: "bundled:alpha" }),
];
// Layout B: no events list at all, like a feed from before 0.7.0.
const feedWithoutEvents = JSON.stringify({ version: 1, slides });
// Layout C: one countdown that is live until 2099.
const feedWithEvent = JSON.stringify({
  version: 1,
  slides,
  events: [
    {
      id: "smoke-countdown",
      kind: "countdown",
      accent: "ahd",
      headline: "A House Divided 1.20: the 2027 world",
      line: "Opens Sunday at 5:00 PM Eastern.",
      art: "bundled:ahd",
      startsAt: "2020-01-01T00:00:00Z",
      endsAt: "2099-01-01T00:00:00Z",
      target: "2099-01-01T00:00:00Z",
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

  async function open(init, feedBody = feedWithoutEvents) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    const cors = { "access-control-allow-origin": "*" };
    await page.route("**/download/launcher/home.json", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", headers: cors, body: feedBody }));
    await page.route("**/account/api/free-access", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", headers: cors, body: '{"on":true}' }));
    await page.route("**/account/api/catalog", (r) => r.abort());
    if (init) await page.addInitScript(init);
    await page.goto(base);
    await page.waitForSelector("header.top", { timeout: 15000 });
    return page;
  }
  const shot = (page, name) => page.screenshot({ path: `${shots}/${name}.png` });
  // Lower-cased: headings are upper-cased by CSS, and innerText follows the CSS.
const text = async (page) => (await page.locator("body").innerText()).replace(/\s+/g, " ").toLowerCase();
const has = (body, wanted) => body.includes(wanted.toLowerCase());

  // Layout B: the filmstrip, with five-tile strip and no live panels.
  let page = await open();
  await page.waitForSelector(".show", { timeout: 15000 });
  let body = await text(page);
  check(await page.locator("nav.tabs .tab").first().innerText() === "Home", "Home is the first tab");
  check(await page.locator("nav.tabs .tab.on").innerText() === "Home", "Home is the default screen");
  check((await page.locator(".show").getAttribute("data-layout")) === "film", "No events: Home shows the filmstrip layout");
  check((await page.locator(".show .live").count()) === 0, "No events: no live panels");
  check(has(body, "Corporate Warfare 2.0 is out"), "Home showcase shows the first slide");
  check(has(body, "Jump back in"), "Home has Jump back in");
  check(has(body, "What changed"), "Home has What changed");
  check((await page.locator(".show .tile").count()) >= 2, "Filmstrip tiles are shown");
  // The free-access answer arrives after first paint; wait for its slide to join, then open it by its tile.
  await page.waitForSelector(".show .tile[aria-label='Show: Free this weekend']", { timeout: 15000, state: "attached" });
  await page.locator(".show .tile[aria-label='Show: Free this weekend']").click();
  check(has(await text(page), "Everything is free to play"), "free-to-play slide shows while the switch is on");
  // Keyboard: focus the showcase, Right goes to the next slide (wraps), Left goes back.
  await page.locator(".show").focus();
  const current = async () => page.locator(".show .tile[aria-current='true']").getAttribute("aria-label");
  const before = await current();
  await page.keyboard.press("ArrowRight");
  const after = await current();
  check(before !== after, "Right arrow changes slide");
  await page.keyboard.press("ArrowLeft");
  check((await current()) === before, "Left arrow goes back");
  await shot(page, "home");
  await page.context().close();

  // Layout C: a live event shows its panel beside the showcase.
  page = await open(undefined, feedWithEvent);
  await page.waitForSelector(".show[data-layout='split']", { timeout: 15000 });
  body = await text(page);
  check((await page.locator(".show .live .lp").count()) === 1, "A live event: one live panel");
  check(has(body, "A House Divided 1.20: the 2027 world"), "The live panel shows the event headline");
  check((await page.locator(".show .live .cd").count()) === 1, "The countdown event shows its countdown");
  check((await page.locator(".show .tile").count()) === 0, "A live event: no filmstrip");
  await shot(page, "home-events");

  await page.locator("nav.tabs .tab", { hasText: "Library" }).click();
  await page.waitForSelector("table");
  body = await text(page);
  check(has(body, "A House Divided") && has(body, "Margin of Victory"), "Library lists the games");
  await shot(page, "library");

  await page.locator("table tbody tr").first().locator("b").first().click();
  await page.waitForTimeout(300);
  body = await text(page);
  check(has(body, "Where you can play"), "Game page opens");
  check(/reinstall|open folder/.test(body), "Game page offers folder and reinstall controls");
  await shot(page, "game");

  await page.locator("nav.tabs .tab", { hasText: "Store" }).click();
  await page.waitForTimeout(300);
  body = await text(page);
  check(has(body, "Support the studio") && has(body, "Champion"), "Store shows the three supporter tiers");
  check(has(body, "$3.00 / month") && has(body, "$9.99 / month") && has(body, "$20.00 / month"), "Store shows the tier prices");
  await shot(page, "store");

  await page.locator("nav.tabs .tab", { hasText: "Downloads" }).click();
  await page.waitForTimeout(300);
  check(has(await text(page), "Where files go"), "Downloads screen opens");
  await shot(page, "downloads");

  await page.locator("button.acct").click();
  await page.waitForTimeout(300);
  check(has(await text(page), "demo-player"), "Account screen opens");
  await shot(page, "account");
  await page.context().close();

  page = await open(() => localStorage.setItem("lakeside.launcher.session", "signed-out"));
  await page.waitForTimeout(500);
  check(has(await text(page), "Sign in with Lakeside Games"), "Signed-out first run shows the sign-in screen");
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
