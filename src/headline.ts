import { parseDate } from "./dates";
import { companyNameAt } from "./model";
import type { TimelineData } from "./types";

export interface Headline {
  id: string;
  text: string;
}

const FALLBACK: Headline = {
  id: "fallback",
  text: "Scroll or drag to travel through the AI money circus.",
};

function companyName(data: TimelineData, id: string, t: number): string {
  const company = data.companies.find((c) => c.id === id);
  return company ? companyNameAt(company, t) : id;
}

interface Candidate {
  id: string;
  date: number;
  text: string;
}

function candidates(data: TimelineData): Candidate[] {
  const items: Candidate[] = [];
  for (const tx of data.transactions) {
    const date = parseDate(tx.date);
    const from = companyName(data, tx.from, date);
    const to = companyName(data, tx.to, date);
    items.push({ id: `tx:${tx.id}`, date, text: `${from} → ${to}: ${tx.description}` });
  }
  for (const event of data.companyEvents) {
    const date = parseDate(event.date);
    items.push({ id: `event:${event.id}`, date, text: `${companyName(data, event.company, date)} — ${event.title}: ${event.note}` });
  }
  data.llmReleases.forEach((release, index) => {
    const date = parseDate(release.date);
    items.push({ id: `release:${index}`, date, text: `${companyName(data, release.company, date)} ships ${release.model}: ${release.note}` });
  });
  return items;
}

/**
 * The single most recent transaction, event, or release at or before time `t` — the
 * "current" story beat for a scrub-position-tied headline ticker. Ties (identical dates)
 * favour whichever candidate was built last, so the result is still deterministic.
 */
export function currentHeadline(data: TimelineData, t: number): Headline {
  let best: Candidate | null = null;
  for (const item of candidates(data)) {
    if (item.date <= t && (!best || item.date >= best.date)) best = item;
  }
  return best ? { id: best.id, text: best.text } : FALLBACK;
}
