import raw from "../data/timeline.json";
import { parseDate } from "./dates";
import type { TimelineData } from "./types";

export const timelineData: TimelineData = raw;

export function getDateRange(data: TimelineData): { min: number; max: number } {
  const dates = [
    ...data.transactions.map((t) => parseDate(t.date)),
    ...data.llmReleases.map((r) => parseDate(r.date)),
    ...data.companyEvents.map((e) => parseDate(e.date)),
  ];
  return { min: Math.min(...dates), max: Math.max(...dates) };
}
