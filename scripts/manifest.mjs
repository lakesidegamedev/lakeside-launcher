#!/usr/bin/env node
// Builds the launcher release manifest from GitHub Releases.
//
// This is the Phase 1 contract between the launcher and the release pipeline:
// products declare which asset filename patterns belong to which OS/arch, and
// the generator emits one signed document. The launcher fetches it before
// downloading anything.
//
// Usage:
//   node scripts/manifest.mjs [--channel stable] [--out manifest/manifest.json]
//
// Signing is enabled by setting LAUNCHER_MANIFEST_KEY to an Ed25519 private key
// in PEM form. Without it the manifest is emitted with "signature": null and
// the CLI prints a warning; the launcher must reject unsigned manifests in
// production.

import { createPrivateKey, sign } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export const PRODUCTS = [
  {
    id: "ahd",
    name: "A House Divided",
    repo: "lakesidegamedev/AHDClient",
    artifacts: [
      { key: "windows-x64", match: /_x64-setup\.exe$/i, kind: "nsis" },
      { key: "macos-arm64", match: /_aarch64\.dmg$/i, kind: "dmg" },
      { key: "macos-x64", match: /_x64\.dmg$/i, kind: "dmg" },
      { key: "linux-x64", match: /_amd64\.AppImage$/i, kind: "appimage" },
      { key: "linux-deb", match: /_amd64\.deb$/i, kind: "deb" },
      { key: "android", match: /\.apk$/i, kind: "apk" },
    ],
  },
  {
    id: "corporate-warfare",
    name: "Corporate Warfare",
    repo: "lakesidegamedev/corporate-warfare",
    artifacts: [
      // Inno Setup program (CorporateWarfare-<version>-setup.exe) and AppImage.
      // Paid builds are delivered through the accounts download endpoint; the
      // manifest entry supplies version, sha256 and installer kind.
      { key: "windows-x64", match: /-setup\.exe$/i, kind: "inno" },
      { key: "linux-x64", match: /\.AppImage$/i, kind: "appimage" },
      { key: "windows-msi", match: /\.msi$/i, kind: "msi" },
      { key: "linux-deb", match: /_amd64\.deb$/i, kind: "deb" },
    ],
  },
];

export function normalizeVersion(tag) {
  return String(tag ?? "").replace(/^v/i, "");
}

/** GitHub returns digests as "sha256:<hex>"; the manifest stores the bare hex. */
export function normalizeDigest(digest) {
  if (!digest) return null;
  const [algorithm, value] = String(digest).split(":");
  if (algorithm !== "sha256" || !value) return null;
  return value.toLowerCase();
}

/**
 * Pure transform from GitHub release documents to the manifest shape.
 * `releases` is a map of repo full name to release (or null).
 */
export function buildManifest({ releases, products = PRODUCTS, channel = "stable", generatedAt = new Date().toISOString() }) {
  const output = {};

  for (const product of products) {
    const release = releases[product.repo];
    if (!release) continue;

    const assets = Array.isArray(release.assets) ? release.assets : [];
    const artifacts = {};
    for (const artifact of product.artifacts) {
      const asset = assets.find((candidate) => artifact.match.test(candidate.name ?? ""));
      if (!asset) continue;
      artifacts[artifact.key] = {
        name: asset.name,
        kind: artifact.kind,
        url: asset.browser_download_url,
        size: asset.size ?? null,
        sha256: normalizeDigest(asset.digest),
      };
    }

    if (Object.keys(artifacts).length === 0) continue;

    output[product.id] = {
      name: product.name,
      version: normalizeVersion(release.tag_name),
      tag: release.tag_name,
      publishedAt: release.published_at ?? null,
      notesUrl: release.html_url ?? null,
      artifacts,
    };
  }

  return {
    schema: 1,
    channel,
    generatedAt,
    products: output,
  };
}

/** Sign the manifest as emitted, minus the signature field. */
export function signManifest(manifest, privateKeyPem) {
  return signBytes(JSON.stringify(manifest), privateKeyPem);
}

/** Sign the exact bytes that will be published. */
export function signBytes(payload, privateKeyPem) {
  return sign(null, Buffer.from(payload), createPrivateKey(privateKeyPem)).toString("base64");
}

async function fetchLatest(repo, token) {
  const headers = {
    accept: "application/vnd.github+json",
    "user-agent": "lakeside-launcher-manifest",
  };
  if (token) headers.authorization = `Bearer ${token}`;

  const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`GitHub ${repo}: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

export async function collectReleases({ products = PRODUCTS, token = process.env.GITHUB_TOKEN } = {}) {
  const entries = await Promise.all(
    products.map(async (product) => [product.repo, await fetchLatest(product.repo, token)]),
  );
  return Object.fromEntries(entries);
}

function parseArgs(argv) {
  const options = { channel: "stable", out: "manifest/manifest.json" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--channel") options.channel = argv[++index] ?? options.channel;
    else if (arg === "--out") options.out = argv[++index] ?? options.out;
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const releases = await collectReleases();
  const manifest = buildManifest({ releases, channel: options.channel });
  const body = `${JSON.stringify(manifest, null, 2)}\n`;

  await mkdir(dirname(options.out), { recursive: true });
  await writeFile(options.out, body);

  const key = process.env.LAUNCHER_MANIFEST_KEY;
  if (key) {
    const signature = signBytes(body, key);
    await writeFile(`${options.out}.sig`, `${signature}\n`);
    console.log(`wrote ${options.out} and ${options.out}.sig with ${Object.keys(manifest.products).length} products`);
  } else {
    console.warn("warning: LAUNCHER_MANIFEST_KEY is unset; wrote an unsigned manifest and no .sig");
    console.log(`wrote ${options.out} with ${Object.keys(manifest.products).length} products`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
