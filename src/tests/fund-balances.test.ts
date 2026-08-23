import { describe, expect, it } from "vitest";

import { applySavingsDeficitClamp } from "@/lib/fund-balances";

const fund = (isSavings: boolean, balance: number, withPending = balance) => ({
  isSavings,
  balance,
  balanceWithPending: withPending,
});

const sum = (funds: Array<{ balance: number }>) =>
  funds.reduce((acc, f) => acc + f.balance, 0);

describe("applySavingsDeficitClamp", () => {
  it("moves an overspend off the fund and onto savings", () => {
    const [groceries, savings] = applySavingsDeficitClamp([
      fund(false, -30),
      fund(true, 100),
    ]);

    expect(groceries.balance).toBe(0);
    expect(savings.balance).toBe(70);
  });

  it("preserves the total", () => {
    const raw = [fund(false, -30), fund(false, 45), fund(true, 100)];
    expect(sum(applySavingsDeficitClamp(raw))).toBe(sum(raw));
  });

  it("lets savings go negative when the deficit exceeds it", () => {
    const [, savings] = applySavingsDeficitClamp([
      fund(false, -200),
      fund(true, 100),
    ]);

    expect(savings.balance).toBe(-100);
  });

  it("keeps the unclamped figures for the delete guard to read", () => {
    const [groceries] = applySavingsDeficitClamp([
      fund(false, -30),
      fund(true, 100),
    ]);

    expect(groceries.balance).toBe(0);
    expect(groceries.rawBalance).toBe(-30);
  });

  it("clamps cleared and pending independently", () => {
    const [groceries, savings] = applySavingsDeficitClamp([
      fund(false, 10, -30),
      fund(true, 100, 100),
    ]);

    expect(groceries.balance).toBe(10);
    expect(groceries.balanceWithPending).toBe(0);
    expect(savings.balance).toBe(100);
    expect(savings.balanceWithPending).toBe(70);
  });

  it("refuses a ledger that is not exactly one savings fund", () => {
    expect(() => applySavingsDeficitClamp([fund(false, 10)])).toThrow(
      "found 0",
    );
    expect(() =>
      applySavingsDeficitClamp([fund(true, 10), fund(true, 10)]),
    ).toThrow("found 2");
  });
});
