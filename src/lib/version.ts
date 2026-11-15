/**
 * Compare two versions the semver way: major, minor and patch numerically, then a release is newer
 * than any pre-release of the same numbers ("1.0.0" is newer than "1.0.0-preview.5"), and two
 * pre-releases compare by their dot-separated parts ("preview.7" is newer than "preview.5").
 * A leading "v" and build metadata after "+" are ignored.
 */
export function compareVersions(left: string, right: string): number {
  const split = (value: string): { core: number[]; pre: string[] } => {
    const trimmed = value.trim().replace(/^[vV]/, "").split("+")[0] ?? "";
    const dash = trimmed.indexOf("-");
    const head = dash < 0 ? trimmed : trimmed.slice(0, dash);
    const tail = dash < 0 ? "" : trimmed.slice(dash + 1);
    const core = head
      .split(".")
      .slice(0, 3)
      .map((part) => {
        const parsed = Number.parseInt(part, 10);
        return Number.isFinite(parsed) ? parsed : 0;
      });
    return { core, pre: tail ? tail.split(".") : [] };
  };

  const a = split(left);
  const b = split(right);
  for (let index = 0; index < 3; index += 1) {
    const difference = (a.core[index] ?? 0) - (b.core[index] ?? 0);
    if (difference !== 0) return difference > 0 ? 1 : -1;
  }
  if (a.pre.length === 0 && b.pre.length === 0) return 0;
  if (a.pre.length === 0) return 1;
  if (b.pre.length === 0) return -1;
  const numeric = /^\d+$/;
  for (let index = 0; index < Math.max(a.pre.length, b.pre.length); index += 1) {
    const x = a.pre[index];
    const y = b.pre[index];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    const xn = numeric.test(x);
    const yn = numeric.test(y);
    if (xn && yn) return Number(x) > Number(y) ? 1 : -1;
    if (xn) return -1;
    if (yn) return 1;
    return x > y ? 1 : -1;
  }
  return 0;
}

/** A manifest version is newer than what is installed. */
export function isNewerVersion(candidate: string, installed: string | null): boolean {
  if (!candidate || !installed) return false;
  return compareVersions(candidate, installed) > 0;
}
