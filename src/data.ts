import raw from "../data/timeline.json";
import { parseDate } from "./dates";
import { TRAVEL_DURATION_FRACTION } from "./model";
import type { TimelineData } from "./types";

export const timelineData: TimelineData = raw;

/**
 * `max` is padded past the latest real data point so a transaction dated right at the edge of the
 * dataset still has room to visibly travel to its destination node before the scrubber hits the
 * end, rather than sitting permanently at progress 0 (hidden under its origin node, since
 * `drawNodes` paints over `drawTransactions`). Solved directly from `renderer.ts`'s
 * `travelDurationMs = (max - min) * TRAVEL_DURATION_FRACTION` so the padding after the raw max
 * exactly equals the resulting travel duration, however that raw max changes over time.
 */
export function getDateRange(data: TimelineData): { min: number; max: number } {
  const dates = [
    ...data.transactions.map((t) => parseDate(t.date)),
    ...data.llmReleases.map((r) => parseDate(r.date)),
    ...data.companyEvents.map((e) => parseDate(e.date)),
  ];
  const min = Math.min(...dates);
  const rawMax = Math.max(...dates);
  const max = (rawMax - TRAVEL_DURATION_FRACTION * min) / (1 - TRAVEL_DURATION_FRACTION);
  return { min, max };
}
