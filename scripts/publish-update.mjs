#!/usr/bin/env node
// Publish a launcher build to the public update feed.
//
// The Tauri updater reads one static JSON document:
//   https://lakesidegames.net/download/launcher/latest.json
//
// Usage:
//   node scripts/publish-update.mjs \
//     --version 0.2.0 \
//     --installer path/to/Lakeside_0.2.0_x64-setup.exe \
//     --signature path/to/Lakeside_0.2.0_x64-setup.exe.sig \
//     --notes "What changed"
//
// Defaults write to /var/www/lakeside-landing/download/launcher, which Caddy
// serves at https://lakesidegames.net/download/launcher/. The signature comes
// from `tauri build` with createUpdaterArtifacts and is verified by the app
// against the public key compiled into tauri.conf.json.

import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

const DEFAULTS = {
  out: "/var/www/lakeside-landing/download/launcher",
  urlBase: "https://lakesidegames.net/download/launcher",
  platform: "windows-x86_64",
};

function parseArgs(argv) {
  const options = { ...DEFAULTS, notes: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--version") (options.version = value), (index += 1);
    else if (arg === "--installer") (options.installer = value), (index += 1);
    else if (arg === "--signature") (options.signature = value), (index += 1);
    else if (arg === "--out") (options.out = value), (index += 1);
    else if (arg === "--url-base") (options.urlBase = value.replace(/\/+$/, "")), (index += 1);
    else if (arg === "--platform") (options.platform = value), (index += 1);
    else if (arg === "--notes") (options.notes = value), (index += 1);
  }
  return options;
}

function validate(options) {
  if (!/^\d+\.\d+\.\d+$/.test(options.version ?? "")) {
    throw new Error("--version must look like 0.2.0");
  }
  if (!options.installer) throw new Error("--installer is required");
  if (!options.signature) throw new Error("--signature is required");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  validate(options);

  const signature = (await readFile(options.signature, "utf8")).trim();
  // Tauri emits the signature as a base64 minisign document; accept either the
  // encoded form or a plain-text minisign file.
  const decoded = signature.startsWith("untrusted comment:")
    ? signature
    : Buffer.from(signature, "base64").toString("utf8");
  if (!decoded.startsWith("untrusted comment:")) {
    throw new Error("signature file does not look like a minisign signature");
  }

  await mkdir(options.out, { recursive: true });

  const installerName = basename(options.installer);
  const installerTarget = join(options.out, installerName);
  await copyFile(options.installer, installerTarget);
  await copyFile(options.signature, `${installerTarget}.sig`);

  const feed = {
    version: options.version,
    notes: options.notes,
    pub_date: new Date().toISOString(),
    platforms: {
      [options.platform]: {
        signature,
        url: `${options.urlBase}/${encodeURIComponent(installerName)}`,
      },
    },
  };

  const feedPath = join(options.out, "latest.json");
  // Keep the temp file on the same filesystem as the feed; /tmp is often a
  // different mount, and rename() refuses to cross devices.
  const tempPath = join(options.out, `.latest-${process.pid}.json`);
  await writeFile(tempPath, `${JSON.stringify(feed, null, 2)}\n`);
  await rename(tempPath, feedPath);

  const bytes = (await readFile(installerTarget)).byteLength;
  console.log(`published ${options.version} -> ${feedPath}`);
  console.log(`artifact ${feed.platforms[options.platform].url} (${Math.round(bytes / 1048576)} MB)`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
