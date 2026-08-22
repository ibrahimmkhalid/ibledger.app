import { describe, expect, it } from "vitest";

import {
  fmtAmount,
  fmtDateShort,
  toDateInputValue,
} from "@/app/tracker/lib/format";

describe("fmtAmount", () => {
  it("puts a negative in accounting parentheses", () => {
    expect(fmtAmount(-42.18)).toBe("($42.18)");
    expect(fmtAmount(1200)).toBe("$1,200.00");
  });

  it("drops the sign in plain style, leaving it to the caller", () => {
    expect(fmtAmount(-42.18, "plain")).toBe("$42.18");
    expect(fmtAmount(42.18, "plain")).toBe("$42.18");
  });

  it("parenthesises negative zero, so callers must clear dust first", () => {
    expect(fmtAmount(-0)).toBe("($0.00)");
  });
});

describe("date formatters", () => {
  it("reads a timestamp as UTC rather than the viewer's day", () => {
    expect(fmtDateShort("2026-01-12T00:00:00.000Z")).toBe("Jan 12, 2026");
    expect(toDateInputValue("2026-01-12T00:00:00.000Z")).toBe("2026-01-12");
  });

  it("falls back to today on an unparseable date", () => {
    expect(toDateInputValue("not a date")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
