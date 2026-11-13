import { describe, expect, it } from "vitest";
import {
  activeDownloads,
  applyProgress,
  etaSeconds,
  fractionOf,
  newDownload,
  nextToStart,
  type DownloadItem,
} from "./downloads";
import { formatBytes, formatDay, formatEta, plainNotes } from "./format";

describe("download queue", () => {
  it("starts the first queued item only when nothing is running", () => {
    const a = newDownload("a", "A", "install", "1.0.0");
    const b = newDownload("b", "B", "update", "2.0.0");
    expect(nextToStart([a, b])).toBe("a");
    expect(nextToStart([{ ...a, status: "running" }, b])).toBeNull();
    expect(nextToStart([{ ...a, status: "done" }, b])).toBe("b");
  });

  it("counts running and queued as active", () => {
    const a = { ...newDownload("a", "A", "install", "1"), status: "failed" as const };
    const b = newDownload("b", "B", "install", "1");
    expect(activeDownloads([a, b]).map((item) => item.id)).toEqual(["b"]);
  });

  it("folds progress into speed, fraction and remaining time", () => {
    let item: DownloadItem = { ...newDownload("a", "A", "install", "1"), status: "running" };
    item = applyProgress(item, 0, 10_000_000, 1000);
    item = applyProgress(item, 2_000_000, 10_000_000, 2000);
    expect(item.speed).toBe(2_000_000);
    expect(fractionOf(item)).toBeCloseTo(0.2);
    expect(etaSeconds(item)).toBeCloseTo(4);
  });

  it("has no fraction or estimate without a total", () => {
    const item = applyProgress(newDownload("a", "A", "install", "1"), 500, null, 10);
    expect(fractionOf(item)).toBeNull();
    expect(etaSeconds(item)).toBeNull();
  });
});

describe("formatting", () => {
  it("formats sizes and times", () => {
    expect(formatBytes(87619097)).toBe("84 MB");
    expect(formatBytes(null)).toBe("-");
    expect(formatEta(10)).toBe("10 s");
    expect(formatEta(null)).toBe("-");
  });

  it("formats release dates and ignores bad ones", () => {
    const now = new Date("2026-11-13T00:00:00Z");
    expect(formatDay("2026-11-11T05:00:00Z", now)).toBe("Nov 11");
    expect(formatDay("2025-03-02T05:00:00Z", now)).toBe("Mar 2, 2025");
    expect(formatDay("nope", now)).toBe("");
  });

  it("flattens release notes into one readable line", () => {
    const text = plainNotes("## What's new\n- **Faster** turn summary\n- Fixed [the ballot](https://x.test)\n\nFull Changelog: abc");
    expect(text).toBe("Faster turn summary. Fixed the ballot");
  });
});
