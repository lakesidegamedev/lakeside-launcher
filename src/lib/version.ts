export function compareVersions(left: string, right: string): number {
  const parse = (value: string): number[] => {
    const head = value.split("-")[0] ?? "";
    return head
      .split(".")
      .slice(0, 3)
      .map((part) => {
        const parsed = Number.parseInt(part, 10);
        return Number.isFinite(parsed) ? parsed : 0;
      });
  };

  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < 3; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference > 0 ? 1 : -1;
  }
  return 0;
}

/** A manifest version is newer than what is installed. */
export function isNewerVersion(candidate: string, installed: string | null): boolean {
  if (!candidate || !installed) return false;
  return compareVersions(candidate, installed) > 0;
}
