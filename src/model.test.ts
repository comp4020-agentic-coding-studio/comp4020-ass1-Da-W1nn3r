import { describe, expect, it } from "vitest";
import { parseDate } from "./dates";
import {
  cumulativeActualByCompany,
  cumulativeGivenActualByCompany,
  cumulativeGivenPaperByCompany,
  cumulativePaperByCompany,
  cumulativeTotals,
  inFlightTransactions,
  nodeActualRadius,
  nodeRadius,
} from "./model";
import type { TimelineData } from "./types";

const data: TimelineData = {
  companies: [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
  ],
  transactions: [
    { id: "t1", date: "2021-01", from: "a", to: "b", paperValue: 100, actualValue: 100, delivered: true, description: "" },
    { id: "t2", date: "2022-01", from: "b", to: "a", paperValue: 300, actualValue: 50, delivered: false, description: "" },
  ],
  llmReleases: [],
  companyEvents: [],
};

describe("cumulativePaperByCompany", () => {
  const travelDuration = parseDate("2021-02") - parseDate("2021-01");

  it("excludes a transaction that has been sent but hasn't arrived yet", () => {
    const totals = cumulativePaperByCompany(data, parseDate("2021-01"), travelDuration);
    expect(totals.get("b")).toBe(0);
  });

  it("only counts a transaction once it has arrived", () => {
    const totals = cumulativePaperByCompany(data, parseDate("2021-01") + travelDuration, travelDuration);
    expect(totals.get("b")).toBe(100);
    expect(totals.get("a")).toBe(0);
  });

  it("accumulates across multiple arrived transactions", () => {
    const totals = cumulativePaperByCompany(data, parseDate("2022-01") + travelDuration, travelDuration);
    expect(totals.get("b")).toBe(100);
    expect(totals.get("a")).toBe(300);
  });

  it("with an infinite t, returns each company's eventual final total — the stable max reference for node scaling", () => {
    const totals = cumulativePaperByCompany(data, Infinity, travelDuration);
    expect(totals.get("b")).toBe(100);
    expect(totals.get("a")).toBe(300);
  });
});

describe("cumulativeActualByCompany", () => {
  const travelDuration = parseDate("2021-02") - parseDate("2021-01");

  it("counts a transaction's actual (not paper) value once it has arrived", () => {
    const totals = cumulativeActualByCompany(data, parseDate("2021-01") + travelDuration, travelDuration);
    expect(totals.get("b")).toBe(100);
  });

  it("reflects the paper-vs-actual gap for a partially-delivered transaction", () => {
    const totals = cumulativeActualByCompany(data, parseDate("2022-01") + travelDuration, travelDuration);
    expect(totals.get("a")).toBe(50);
  });
});

describe("cumulativeGivenPaperByCompany", () => {
  const travelDuration = parseDate("2021-02") - parseDate("2021-01");

  it("counts a transaction the instant it's sent, unlike the received total which waits for arrival", () => {
    const totals = cumulativeGivenPaperByCompany(data, parseDate("2021-01"), travelDuration);
    expect(totals.get("a")).toBe(100);
  });

  it("does not count a transaction before its send date", () => {
    const totals = cumulativeGivenPaperByCompany(data, parseDate("2020-12"), travelDuration);
    expect(totals.get("a")).toBe(0);
  });

  it("accumulates across multiple sent transactions", () => {
    const totals = cumulativeGivenPaperByCompany(data, parseDate("2022-01"), travelDuration);
    expect(totals.get("a")).toBe(100);
    expect(totals.get("b")).toBe(300);
  });
});

describe("cumulativeGivenActualByCompany", () => {
  const travelDuration = parseDate("2021-02") - parseDate("2021-01");

  it("counts a transaction's actual (not paper) value the instant it's sent", () => {
    const totals = cumulativeGivenActualByCompany(data, parseDate("2021-01"), travelDuration);
    expect(totals.get("a")).toBe(100);
  });

  it("reflects the paper-vs-actual gap for a partially-delivered transaction", () => {
    const totals = cumulativeGivenActualByCompany(data, parseDate("2022-01"), travelDuration);
    expect(totals.get("b")).toBe(50);
  });
});

describe("cumulativeTotals", () => {
  it("sums paper and actual value separately", () => {
    expect(cumulativeTotals(data, parseDate("2022-06"))).toEqual({ paper: 400, actual: 150 });
  });

  it("is zero before any transaction", () => {
    expect(cumulativeTotals(data, parseDate("2020-01"))).toEqual({ paper: 0, actual: 0 });
  });
});

describe("inFlightTransactions", () => {
  const travelDuration = parseDate("2021-02") - parseDate("2021-01");

  it("excludes transactions that haven't happened yet", () => {
    expect(inFlightTransactions(data, parseDate("2020-12"), travelDuration)).toHaveLength(0);
  });

  it("includes a transaction mid-travel with partial progress", () => {
    const midpoint = parseDate("2021-01") + travelDuration / 2;
    const [flight] = inFlightTransactions(data, midpoint, travelDuration);
    expect(flight?.transaction.id).toBe("t1");
    expect(flight?.progress).toBeCloseTo(0.5);
  });

  it("drops a transaction once it has fully arrived", () => {
    const afterArrival = parseDate("2021-01") + travelDuration * 2;
    expect(inFlightTransactions(data, afterArrival, travelDuration).some((f) => f.transaction.id === "t1")).toBe(false);
  });
});

describe("nodeRadius", () => {
  it("returns the minimum radius when there's no value", () => {
    expect(nodeRadius(0, 100, 1000)).toBeCloseTo(25);
  });

  it("returns the maximum radius at the max value", () => {
    expect(nodeRadius(100, 100, 1000)).toBeCloseTo(90);
  });

  it("falls back to the minimum radius when nothing has a value yet", () => {
    expect(nodeRadius(0, 0, 1000)).toBeCloseTo(25);
  });
});

describe("nodeActualRadius", () => {
  it("shrinks to zero when nothing has actually landed, unlike nodeRadius's floor", () => {
    expect(nodeActualRadius(0, 100, 1000)).toBe(0);
  });

  it("matches nodeRadius's maximum when actual value equals the max", () => {
    expect(nodeActualRadius(100, 100, 1000)).toBeCloseTo(nodeRadius(100, 100, 1000));
  });

  it("exactly fills nodeRadius's ring when fully delivered, even well below the max", () => {
    expect(nodeActualRadius(20, 100, 1000)).toBe(nodeRadius(20, 100, 1000));
  });
});
