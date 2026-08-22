import { describe, expect, it } from "vitest";

import { fundSharesExceedHundred, isValidFundShare } from "@/lib/fund-shares";

describe("isValidFundShare", () => {
  it("accepts the closed range 0 to 100", () => {
    expect(isValidFundShare(0)).toBe(true);
    expect(isValidFundShare(33.3)).toBe(true);
    expect(isValidFundShare(100)).toBe(true);
  });

  it("rejects anything outside it", () => {
    expect(isValidFundShare(-0.1)).toBe(false);
    expect(isValidFundShare(100.1)).toBe(false);
    expect(isValidFundShare(NaN)).toBe(false);
    expect(isValidFundShare(Infinity)).toBe(false);
  });
});

describe("fundSharesExceedHundred", () => {
  it("allows a full allocation but nothing past it", () => {
    expect(fundSharesExceedHundred(100)).toBe(false);
    expect(fundSharesExceedHundred(99.99)).toBe(false);
    expect(fundSharesExceedHundred(100.01)).toBe(true);
  });
});
