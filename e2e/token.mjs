// Signs in as the second test account the way the launcher does (loopback
// callback, one-time code, POST /account/launcher/session) in a headless
// browser, and writes the bearer to the file named by argv[2]. For the Linux
// install check, where the launcher window itself cannot be driven.
import { chromium } from "playwright-core";
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";

const user = process.env.LAKESIDE_TEST2_USERNAME;
const pass = process.env.LAKESIDE_TEST2_PASSWORD;
const out = process.argv[2];
const shots = process.env.SHOT_DIR || "e2e-shots";
if (!user || !pass || !out) throw new Error("credentials and an output file are required");
fs.mkdirSync(shots, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const port = 47833;
const state = crypto.randomBytes(16).toString("hex");
let captured = null;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  if (url.pathname === "/callback" && url.searchParams.get("state") === state && url.searchParams.get("code")) {
    captured = url.searchParams.get("code");
  }
  res.end("ok");
});
await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage();
const deadline = Date.now() + 120000;
try {
  await page.goto(`https://lakesidegames.net/account/launcher/start?provider=ahd&port=${port}&state=${state}`);
  const email = page.locator("input#email, input[name=email], input[name=username]").first();
  await email.waitFor({ timeout: 60000 });
  await email.fill(user);
  await page.locator("input[type=password]").first().fill(pass);
  await page.locator("button[type=submit], input[type=submit]").first().click();
  while (!captured && Date.now() < deadline) {
    for (const name of ["Authorize", "Allow", "Approve"]) {
      const button = page.getByRole("button", { name, exact: true }).first();
      if (await button.isVisible().catch(() => false)) {
        await button.click().catch(() => {});
        break;
      }
    }
    await sleep(500);
  }
  if (!captured) throw new Error("the sign-in never reached the loopback callback");
  const response = await fetch("https://lakesidegames.net/account/launcher/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: captured }),
  });
  if (!response.ok) throw new Error(`session exchange returned ${response.status}`);
  const body = await response.json();
  if (!body.token) throw new Error("the session answer had no token");
  console.log(`::add-mask::${body.token}`);
  fs.writeFileSync(out, body.token, { mode: 0o600 });
  console.log(`signed in as ${String(body.session?.username ?? "").toLowerCase() === user.toLowerCase() ? "the second test account" : "someone else"}`);
} catch (e) {
  await page.screenshot({ path: `${shots}/token-FAILED.png` }).catch(() => {});
  console.error(String(e.message).split(pass).join("***"));
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
