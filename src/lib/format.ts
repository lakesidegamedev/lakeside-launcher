export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return "-";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function formatSpeed(bytesPerSecond: number | null): string {
  if (bytesPerSecond === null || bytesPerSecond <= 0) return "-";
  return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
}

export function formatEta(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return "-";
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  return `${(seconds / 3600).toFixed(1)} h`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Nov 11" for this year, "Nov 11, 2025" otherwise. Empty for a bad date. */
export function formatDay(value: string | number | null | undefined, now = new Date()): string {
  if (value === null || value === undefined || value === "") return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const text = `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
  return date.getUTCFullYear() === now.getUTCFullYear() ? text : `${text}, ${date.getUTCFullYear()}`;
}

/** One short line of a release body: markdown marks and headings removed. */
export function plainNotes(body: string, maxLength = 220): string {
  const lines = body
    .split(/\r?\n/)
    .filter((line) => !/^\s*#/.test(line))
    .map((line) =>
      line
        .replace(/^\s*[-*]\s+/, "")
        .replace(/\*\*|__|`/g, "")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .trim(),
    )
    .filter((line) => line.length > 0 && !/^(full changelog|what's changed)/i.test(line));
  const text = lines.join(". ").replace(/\.\./g, ".");
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}...` : text;
}
