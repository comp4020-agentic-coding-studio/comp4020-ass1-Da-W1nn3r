import { parseDate } from "./dates";
import type { Company, Transaction, TimelineData } from "./types";

/** Fraction of the total date range a transaction spends visibly traveling before it settles. */
export const TRAVEL_DURATION_FRACTION = 0.03;

const NODE_MIN_RADIUS_FRACTION = 0.025;
const NODE_MAX_RADIUS_FRACTION = 0.09;
const TRANSACTION_MIN_RADIUS_FRACTION = 0.012;
const TRANSACTION_MAX_RADIUS_FRACTION = 0.032;

function scaledRadius(
  value: number,
  maxValue: number,
  canvasMinDimension: number,
  minFraction: number,
  maxFraction: number,
): number {
  const minRadius = canvasMinDimension * minFraction;
  const maxRadius = canvasMinDimension * maxFraction;
  if (maxValue <= 0) return minRadius;
  const scale = Math.sqrt(Math.min(1, Math.max(0, value / maxValue)));
  return minRadius + (maxRadius - minRadius) * scale;
}

/**
 * Sums whatever `valueOf` extracts from each transaction into whichever party `party` picks
 * (the receiver or the sender), up to time `t`. When `settleAfterTravel` is true a transaction
 * counts only once it has visually arrived — `travelDurationMs` after its date, matching when
 * `inFlightTransactions` drops it — which is right for a receiver (money isn't theirs until it
 * lands). A sender's money leaves them the moment they send it, though, so `settleAfterTravel:
 * false` counts a transaction from its raw date instead, with no travel delay.
 */
function cumulativeByCompany(
  data: TimelineData,
  t: number,
  travelDurationMs: number,
  party: (transaction: Transaction) => string,
  valueOf: (transaction: Transaction) => number,
  settleAfterTravel: boolean,
): Map<string, number> {
  const totals = new Map(data.companies.map((c) => [c.id, 0]));
  for (const transaction of data.transactions) {
    const date = parseDate(transaction.date);
    const settledAt = settleAfterTravel ? date + travelDurationMs : date;
    if (settledAt <= t) {
      const key = party(transaction);
      totals.set(key, (totals.get(key) ?? 0) + valueOf(transaction));
    }
  }
  return totals;
}

/** Sum of paper value each company has received, up to time `t` (drives a node's outer ring). */
export function cumulativePaperByCompany(data: TimelineData, t: number, travelDurationMs: number): Map<string, number> {
  return cumulativeByCompany(data, t, travelDurationMs, (transaction) => transaction.to, (transaction) => transaction.paperValue, true);
}

/** Sum of actual (delivered) value each company has received, up to time `t` (drives a node's filled core). */
export function cumulativeActualByCompany(data: TimelineData, t: number, travelDurationMs: number): Map<string, number> {
  return cumulativeByCompany(data, t, travelDurationMs, (transaction) => transaction.to, (transaction) => transaction.actualValue, true);
}

/**
 * Sum of paper value each company has given away, up to time `t` — the "given" counterpart to
 * `cumulativePaperByCompany`. Settles at the transaction's own date rather than after travel: a
 * sender's commitment leaves them the instant they send it, not once the travelling circle
 * reaches the destination.
 */
export function cumulativeGivenPaperByCompany(data: TimelineData, t: number, travelDurationMs: number): Map<string, number> {
  return cumulativeByCompany(data, t, travelDurationMs, (transaction) => transaction.from, (transaction) => transaction.paperValue, false);
}

/** Sum of actual (delivered) value each company has given away, up to time `t` — the "given" counterpart to `cumulativeActualByCompany`. */
export function cumulativeGivenActualByCompany(data: TimelineData, t: number, travelDurationMs: number): Map<string, number> {
  return cumulativeByCompany(data, t, travelDurationMs, (transaction) => transaction.from, (transaction) => transaction.actualValue, false);
}

/** Running paper vs. actual totals across every transaction up to time `t`. */
export function cumulativeTotals(data: TimelineData, t: number): { paper: number; actual: number } {
  let paper = 0;
  let actual = 0;
  for (const transaction of data.transactions) {
    if (parseDate(transaction.date) <= t) {
      paper += transaction.paperValue;
      actual += transaction.actualValue;
    }
  }
  return { paper, actual };
}

export interface InFlightTransaction {
  transaction: Transaction;
  progress: number;
}

/**
 * Transactions currently traveling from their origin to their destination node at time `t`:
 * visible from their date until `travelDurationMs` later, at which point they've settled into
 * the destination node's cumulative total instead.
 */
export function inFlightTransactions(
  data: TimelineData,
  t: number,
  travelDurationMs: number,
): InFlightTransaction[] {
  const result: InFlightTransaction[] = [];
  for (const transaction of data.transactions) {
    const date = parseDate(transaction.date);
    if (t < date) continue;
    const progress = (t - date) / travelDurationMs;
    if (progress < 1) result.push({ transaction, progress });
  }
  return result;
}

/**
 * Earliest date each company appears anywhere in the dataset — a transaction, a company event, or
 * a model release — i.e. the moment it becomes part of this story, not necessarily its real-world
 * founding date. Drives when a node is allowed onto the canvas at all.
 */
export function establishedDatesByCompany(data: TimelineData): Map<string, number> {
  const dates = new Map<string, number>();
  const note = (id: string, date: number): void => {
    const existing = dates.get(id);
    if (existing === undefined || date < existing) dates.set(id, date);
  };
  for (const transaction of data.transactions) {
    const date = parseDate(transaction.date);
    note(transaction.from, date);
    note(transaction.to, date);
  }
  for (const event of data.companyEvents) note(event.company, parseDate(event.date));
  for (const release of data.llmReleases) note(release.company, parseDate(release.date));
  return dates;
}

/** Companies established at or before `t`, in their original relative order (for stable, even layout spacing). */
export function establishedCompanies(data: TimelineData, t: number, establishedDates: Map<string, number>): Company[] {
  return data.companies.filter((company) => (establishedDates.get(company.id) ?? Infinity) <= t);
}

/** A company's displayed name at time `t` — its base `name` until the latest `renames` entry at or before `t` takes over. */
export function companyNameAt(company: Company, t: number): string {
  let name = company.name;
  let bestDate = -Infinity;
  for (const rename of company.renames ?? []) {
    const date = parseDate(rename.date);
    if (date <= t && date > bestDate) {
      bestDate = date;
      name = rename.name;
    }
  }
  return name;
}

/** Sqrt-scaled node radius, proportional to canvas size so it holds up at any viewport. */
export function nodeRadius(value: number, maxValue: number, canvasMinDimension: number): number {
  return scaledRadius(value, maxValue, canvasMinDimension, NODE_MIN_RADIUS_FRACTION, NODE_MAX_RADIUS_FRACTION);
}

/**
 * Radius for a node's filled "actual" core — the exact same formula as `nodeRadius`, so a
 * fully-delivered company's core exactly fills its outer ring regardless of that company's
 * absolute scale. The one difference: zero actual value draws no core at all (skipping
 * `nodeRadius`'s floor), so a company still owed everything shows an empty ring rather than a
 * misleading dot implying some delivery has happened.
 */
export function nodeActualRadius(value: number, maxValue: number, canvasMinDimension: number): number {
  if (value <= 0) return 0;
  return nodeRadius(value, maxValue, canvasMinDimension);
}

/** Sqrt-scaled radius for an in-flight transaction circle — smaller than a node's. */
export function transactionRadius(value: number, maxValue: number, canvasMinDimension: number): number {
  return scaledRadius(
    value,
    maxValue,
    canvasMinDimension,
    TRANSACTION_MIN_RADIUS_FRACTION,
    TRANSACTION_MAX_RADIUS_FRACTION,
  );
}
