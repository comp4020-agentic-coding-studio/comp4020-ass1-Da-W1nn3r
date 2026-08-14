const DATE_PATTERN = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/;

/** Parses "YYYY", "YYYY-MM", or "YYYY-MM-DD" into a comparable epoch-ms timestamp. */
export function parseDate(date: string): number {
  const match = DATE_PATTERN.exec(date.trim());
  if (!match) {
    throw new Error(`Unrecognised date format: "${date}"`);
  }
  const [, year, month, day] = match;
  return Date.UTC(Number(year), month ? Number(month) - 1 : 0, day ? Number(day) : 1);
}

/** Formats an epoch-ms timestamp back to its calendar year, for timeline tick labels. */
export function formatYear(epochMs: number): string {
  return String(new Date(epochMs).getUTCFullYear());
}
