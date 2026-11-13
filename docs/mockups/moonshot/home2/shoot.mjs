// node shoot.mjs <outDir> ; renders every page/size. One browser, sequential.
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire("/opt/keir/releases/92641afa0aad/node_modules/");
const { chromium } = require("playwright-core");
const dir = path.resolve(".");
const out = process.argv[2];
const jobs = JSON.parse(process.argv[3]); // [[file, w,h, query, name]]
const browser = await chromium.launch();
for (const [f, w, h, q, name] of jobs) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  await p.goto(`file://${dir}/${f}.html?${q}`);
  await p.waitForTimeout(900);
  await p.screenshot({ path: `${out}/${name}.jpg`, type: "jpeg", quality: 88 });
  await ctx.close();
}
await browser.close();
