import { describe, expect, it } from "vitest";
import { currentHeadline } from "./headline";
import { parseDate } from "./dates";
import type { TimelineData } from "./types";

const data: TimelineData = {
  companies: [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
  ],
  transactions: [
    { id: "t1", date: "2021-01", from: "a", to: "b", paperValue: 100, actualValue: 100, delivered: true, description: "A gives B money" },
    { id: "t2", date: "2022-01", from: "b", to: "a", paperValue: 300, actualValue: 50, delivered: false, description: "B pledges to A" },
  ],
  llmReleases: [{ date: "2021-06", company: "a", model: "A-1", note: "A ships its first model" }],
  companyEvents: [{ id: "e1", date: "2023-01", company: "b", title: "Reorg", note: "B reorganises" }],
};

describe("currentHeadline", () => {
  it("falls back to a default before anything has happened", () => {
    expect(currentHeadline(data, parseDate("2020-01")).id).toBe("fallback");
  });

  it("picks the most recent transaction at or before t", () => {
    const headline = currentHeadline(data, parseDate("2021-01"));
    expect(headline.id).toBe("tx:t1");
    expect(headline.text).toContain("A gives B money");
  });

  it("picks whichever candidate is latest, whatever its kind", () => {
    expect(currentHeadline(data, parseDate("2021-06")).id).toBe("release:0");
    expect(currentHeadline(data, parseDate("2022-01")).id).toBe("tx:t2");
    expect(currentHeadline(data, parseDate("2023-01")).id).toBe("event:e1");
  });

  it("stays on the latest candidate after everything has happened", () => {
    expect(currentHeadline(data, Infinity).id).toBe("event:e1");
  });
});
