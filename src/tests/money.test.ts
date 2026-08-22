import { describe, expect, it } from "vitest";

import { MONEY_TOLERANCE, holdsMoney } from "@/lib/money";

describe("holdsMoney", () => {
  it("reads float dust as nothing", () => {
    expect(holdsMoney(0)).toBe(false);
    expect(holdsMoney(0.1 + 0.2 - 0.3)).toBe(false);
    expect(holdsMoney(-0)).toBe(false);
  });

  it("splits at half a cent", () => {
    expect(holdsMoney(MONEY_TOLERANCE - 0.001)).toBe(false);
    expect(holdsMoney(MONEY_TOLERANCE)).toBe(true);
    expect(holdsMoney(-MONEY_TOLERANCE)).toBe(true);
  });

  it("counts a debt as money held", () => {
    expect(holdsMoney(-12.5)).toBe(true);
  });

  it("fails closed on a broken balance", () => {
    expect(holdsMoney(NaN)).toBe(true);
    expect(holdsMoney(Infinity)).toBe(true);
    expect(holdsMoney(-Infinity)).toBe(true);
  });
});
