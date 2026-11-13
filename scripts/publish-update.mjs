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
// One feed entry per platform. Repeat --artifact to publish every platform in
// a single feed write (the updater errors for a platform missing from the
// feed, so a new version must list all of them at once):
//   node scripts/publish-update.mjs --version 0.6.0 --notes "..." \
//     --artifact windows-x86_64:Lakeside_0.6.0_x64-setup.exe:Lakeside_0.6.0_x64-setup.exe.sig \
//     --artifact darwin-aarch64,darwin-x86_64:Lakeside_universal.app.tar.gz:Lakeside_universal.app.tar.gz.sig \
//     --artifact linux-x86_64:Lakeside_0.6.0_amd64.AppImage:Lakeside_0.6.0_amd64.AppImage.sig
// A comma-separated platform list points several entries at one file (the
// universal macOS build serves both darwin keys). The macOS file is the
// .app.tar.gz, not the .dmg; the .dmg is the first-time download.
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
    else if (arg === "--artifact") {
      (options.artifacts ??= []).push(value), (index += 1);
    } else if (arg === "--notes") (options.notes = value), (index += 1);
  }
  return options;
}

function validate(options) {
  if (!/^\d+\.\d+\.\d+$/.test(options.version ?? "")) {
    throw new Error("--version must look like 0.2.0");
  }
  if (options.artifacts?.length) return;
  if (!options.installer) throw new Error("--installer is required");
  if (!options.signature) throw new Error("--signature is required");
}

const KNOWN_PLATFORMS = new Set([
  "windows-x86_64",
  "darwin-aarch64",
  "darwin-x86_64",
  "linux-x86_64",
]);

/** Normalize the single-artifact flags and repeated --artifact into one list. */
function artifactList(options) {
  if (!options.artifacts?.length) {
    return [
      { platforms: [options.platform], installer: options.installer, signature: options.signature },
    ];
  }
  return options.artifacts.map((spec) => {
    const [platformList, installer, signature] = String(spec).split(":");
    if (!platformList || !installer || !signature) {
      throw new Error(`--artifact needs platform:installer:signature, got "${spec}"`);
    }
    const platforms = platformList.split(",");
    for (const platform of platforms) {
      if (!KNOWN_PLATFORMS.has(platform)) throw new Error(`unknown platform "${platform}"`);
    }
    return { platforms, installer, signature };
  });
}

async function readSignature(path) {
  const signature = (await readFile(path, "utf8")).trim();
  // Tauri emits the signature as a base64 minisign document; accept either the
  // encoded form or a plain-text minisign file.
  const decoded = signature.startsWith("untrusted comment:")
    ? signature
    : Buffer.from(signature, "base64").toString("utf8");
  if (!decoded.startsWith("untrusted comment:")) {
    throw new Error(`${path} does not look like a minisign signature`);
  }
  return signature;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  validate(options);

  await mkdir(options.out, { recursive: true });

  const platforms = {};
  const published = [];
  for (const artifact of artifactList(options)) {
    const signature = await readSignature(artifact.signature);
    const installerName = basename(artifact.installer);
    const installerTarget = join(options.out, installerName);
    await copyFile(artifact.installer, installerTarget);
    await copyFile(artifact.signature, `${installerTarget}.sig`);
    for (const platform of artifact.platforms) {
      platforms[platform] = {
        signature,
        url: `${options.urlBase}/${encodeURIComponent(installerName)}`,
      };
    }
    published.push({ platforms: artifact.platforms, target: installerTarget });
  }

  const feed = {
    version: options.version,
    notes: options.notes,
    pub_date: new Date().toISOString(),
    platforms,
  };

  const feedPath = join(options.out, "latest.json");
  // Keep the temp file on the same filesystem as the feed; /tmp is often a
  // different mount, and rename() refuses to cross devices.
  const tempPath = join(options.out, `.latest-${process.pid}.json`);
  await writeFile(tempPath, `${JSON.stringify(feed, null, 2)}\n`);
  await rename(tempPath, feedPath);

  console.log(`published ${options.version} -> ${feedPath}`);
  for (const entry of published) {
    const bytes = (await readFile(entry.target)).byteLength;
    console.log(`${entry.platforms.join(",")}: ${entry.target} (${Math.round(bytes / 1048576)} MB)`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
