import { describe, expect, it } from "vitest";
import { formatYear, parseDate } from "./dates";

describe("parseDate", () => {
  it("parses a bare year", () => {
    expect(parseDate("2021")).toBe(Date.UTC(2021, 0, 1));
  });

  it("parses a year and month", () => {
    expect(parseDate("2021-09")).toBe(Date.UTC(2021, 8, 1));
  });

  it("parses a full date", () => {
    expect(parseDate("2021-09-15")).toBe(Date.UTC(2021, 8, 15));
  });

  it("orders chronologically", () => {
    expect(parseDate("2021-02")).toBeLessThan(parseDate("2021-09"));
    expect(parseDate("2023")).toBeLessThan(parseDate("2024"));
  });

  it("rejects malformed input", () => {
    expect(() => parseDate("not-a-date")).toThrow();
  });
});

describe("formatYear", () => {
  it("extracts the calendar year", () => {
    expect(formatYear(parseDate("2024-06-01"))).toBe("2024");
  });
});
