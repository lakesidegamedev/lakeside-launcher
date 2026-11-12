import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import { describe, it } from "node:test";
import {
  PRODUCTS,
  buildManifest,
  normalizeDigest,
  normalizeVersion,
  signBytes,
  signManifest,
} from "./manifest.mjs";

const ahdRelease = {
  tag_name: "v2.6.2",
  published_at: "2026-11-01T12:00:00Z",
  html_url: "https://github.com/lakesidegamedev/AHDClient/releases/tag/v2.6.2",
  assets: [
    {
      name: "AHDClient_2.6.2_x64-setup.exe",
      browser_download_url: "https://example.test/ahd-setup.exe",
      size: 81234567,
      digest: "sha256:ABCDEF",
    },
    {
      name: "AHDClient_2.6.2_aarch64.dmg",
      browser_download_url: "https://example.test/ahd-arm.dmg",
      size: 90000000,
      digest: "sha256:111111",
    },
    {
      name: "AHDClient_2.6.2_x64.dmg",
      browser_download_url: "https://example.test/ahd-x64.dmg",
      size: 88000000,
      digest: "sha256:222222",
    },
    {
      name: "AHDClient_2.6.2_amd64.AppImage",
      browser_download_url: "https://example.test/ahd.AppImage",
      size: 70000000,
      digest: null,
    },
    { name: "latest.yml", browser_download_url: "https://example.test/latest.yml", size: 200 },
  ],
};

const cwRelease = {
  tag_name: "v1.7.1",
  published_at: "2026-10-20T12:00:00Z",
  html_url: "https://github.com/lakesidegamedev/corporate-warfare/releases/tag/v1.7.1",
  assets: [
    { name: "Corporate.Warfare-1.7.1.msi", browser_download_url: "https://example.test/cw.msi", size: 100 },
    { name: "corporate-warfare_1.7.1-1_amd64.deb", browser_download_url: "https://example.test/cw.deb", size: 90 },
  ],
};

describe("manifest", () => {
  const manifest = buildManifest({
    releases: { "lakesidegamedev/AHDClient": ahdRelease, "lakesidegamedev/corporate-warfare": cwRelease },
    generatedAt: "2026-11-12T00:00:00.000Z",
  });

  it("normalizes versions and digests", () => {
    assert.equal(normalizeVersion("v2.6.2"), "2.6.2");
    assert.equal(normalizeVersion("1.7.1"), "1.7.1");
    assert.equal(normalizeDigest("sha256:ABCDEF"), "abcdef");
    assert.equal(normalizeDigest("md5:abc"), null);
    assert.equal(normalizeDigest(null), null);
  });

  it("maps AHD assets to the right platform keys", () => {
    const ahd = manifest.products.ahd;
    assert.equal(ahd.version, "2.6.2");
    assert.equal(ahd.artifacts["windows-x64"].kind, "nsis");
    assert.equal(ahd.artifacts["macos-arm64"].url, "https://example.test/ahd-arm.dmg");
    assert.equal(ahd.artifacts["macos-x64"].url, "https://example.test/ahd-x64.dmg");
    assert.equal(ahd.artifacts["linux-x64"].kind, "appimage");
    assert.equal(ahd.artifacts["windows-x64"].sha256, "abcdef");
    assert.equal(ahd.artifacts["linux-x64"].sha256, null);
  });

  it("ignores unrelated release assets", () => {
    const names = Object.values(manifest.products.ahd.artifacts).map((artifact) => artifact.name);
    assert.ok(!names.includes("latest.yml"));
  });

  it("maps Corporate Warfare and keeps products separate", () => {
    assert.equal(manifest.products["corporate-warfare"].version, "1.7.1");
    assert.equal(manifest.products["corporate-warfare"].artifacts["windows-x64"].kind, "msi");
  });

  it("skips products with no release or no matching assets", () => {
    const partial = buildManifest({
      releases: { "lakesidegamedev/AHDClient": { tag_name: "v9", assets: [] } },
      generatedAt: "2026-11-12T00:00:00.000Z",
    });
    assert.deepEqual(partial.products, {});
  });

  it("is stable for a fixed generatedAt", () => {
    const again = buildManifest({
      releases: { "lakesidegamedev/AHDClient": ahdRelease, "lakesidegamedev/corporate-warfare": cwRelease },
      generatedAt: "2026-11-12T00:00:00.000Z",
    });
    assert.equal(JSON.stringify(again), JSON.stringify(manifest));
  });

  it("has a product config for every known launcher product", () => {
    const ids = PRODUCTS.map((product) => product.id);
    assert.deepEqual(ids, ["ahd", "corporate-warfare"]);
  });

  it("signs the exact manifest payload with ed25519", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const signature = signManifest(manifest, privateKey.export({ type: "pkcs8", format: "pem" }));
    const valid = verify(
      null,
      Buffer.from(JSON.stringify(manifest)),
      publicKey,
      Buffer.from(signature, "base64"),
    );
    assert.equal(valid, true);
  });

  it("signs the exact published bytes, including the trailing newline", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const body = `${JSON.stringify(manifest, null, 2)}\n`;
    const signature = signBytes(body, privateKey.export({ type: "pkcs8", format: "pem" }));
    assert.equal(
      verify(null, Buffer.from(body), publicKey, Buffer.from(signature, "base64")),
      true,
    );
    assert.equal(
      verify(null, Buffer.from(body.trim()), publicKey, Buffer.from(signature, "base64")),
      false,
    );
  });
});
