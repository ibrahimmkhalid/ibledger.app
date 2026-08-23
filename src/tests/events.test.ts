import { describe, expect, it } from "vitest";

import type { TransactionEvent, TransactionLine } from "@/app/tracker/types";
import {
  computeEventDisplayAmount,
  computeEventFundName,
  computeEventWalletName,
  isIncomeLike,
} from "@/app/tracker/lib/events";

const line = (over: Partial<TransactionLine>): TransactionLine => ({
  id: 1,
  parentId: 10,
  occurredAt: "2026-01-12T00:00:00.000Z",
  description: null,
  isPending: false,
  amount: 0,
  incomePull: null,
  walletId: null,
  walletName: null,
  fundId: null,
  fundName: null,
  ...over,
});

const event = (over: Partial<TransactionEvent>): TransactionEvent => ({
  id: 10,
  occurredAt: "2026-01-12T00:00:00.000Z",
  description: null,
  amount: 0,
  isPosting: false,
  isPending: false,
  incomePull: null,
  walletId: null,
  walletName: null,
  fundId: null,
  fundName: null,
  children: [],
  ...over,
});

describe("computeEventDisplayAmount", () => {
  it("uses its own amount when the event has no children", () => {
    expect(computeEventDisplayAmount(event({ amount: -42.18 }))).toBe(-42.18);
  });

  it("sums the wallet side of a multi-line event", () => {
    const ev = event({
      children: [
        line({ id: 1, walletId: 1, amount: -30 }),
        line({ id: 2, walletId: 1, amount: -12.18 }),
      ],
    });

    expect(computeEventDisplayAmount(ev)).toBeCloseTo(-42.18, 10);
  });

  it("reads zero for a transfer, where both sides cancel", () => {
    const ev = event({
      children: [
        line({ id: 1, walletId: 1, fundId: 3, amount: -100 }),
        line({ id: 2, walletId: 2, fundId: 3, amount: 100 }),
      ],
    });

    expect(computeEventDisplayAmount(ev)).toBe(0);
  });

  it("falls back to the fund side when the wallets cancel but the funds do not", () => {
    const ev = event({
      children: [
        line({ id: 1, walletId: 1, fundId: 3, amount: -100 }),
        line({ id: 2, walletId: 2, fundId: 4, amount: 100 }),
        line({ id: 3, fundId: 5, amount: 25 }),
      ],
    });

    expect(computeEventDisplayAmount(ev)).toBe(25);
  });
});

describe("computeEventWalletName", () => {
  it("names one wallet, or reports several", () => {
    const oneWallet = event({
      children: [
        line({ id: 1, walletId: 1, walletName: "Checking" }),
        line({ id: 2, walletId: 1, walletName: "Checking" }),
      ],
    });
    const twoWallets = event({
      children: [
        line({ id: 1, walletId: 1, walletName: "Checking" }),
        line({ id: 2, walletId: 2, walletName: "Cash" }),
      ],
    });

    expect(computeEventWalletName(oneWallet)).toBe("Checking");
    expect(computeEventWalletName(twoWallets)).toBe("Multiple");
    expect(computeEventWalletName(event({ walletName: "Checking" }))).toBe(
      "Checking",
    );
    expect(computeEventWalletName(event({ children: [line({})] }))).toBeNull();
  });
});

describe("computeEventFundName", () => {
  it("names no fund for income, which lands across all of them", () => {
    const income = event({
      children: [
        line({
          id: 1,
          walletId: 1,
          fundId: 3,
          fundName: "Rent",
          incomePull: 40,
        }),
      ],
    });

    expect(computeEventFundName(income)).toBeNull();
  });

  it("names one fund, or reports several", () => {
    const oneFund = event({
      children: [line({ id: 1, fundId: 3, fundName: "Groceries" })],
    });
    const twoFunds = event({
      children: [
        line({ id: 1, fundId: 3, fundName: "Groceries" }),
        line({ id: 2, fundId: 4, fundName: "Rent" }),
      ],
    });

    expect(computeEventFundName(oneFund)).toBe("Groceries");
    expect(computeEventFundName(twoFunds)).toBe("Multiple");
  });
});

describe("isIncomeLike", () => {
  const allocation = (over: Partial<TransactionLine>) =>
    line({ walletId: 1, incomePull: 40, amount: 100, ...over });

  it("recognises one wallet paid into several funds", () => {
    const ev = event({
      children: [
        allocation({ id: 1, fundId: 3, amount: 400 }),
        allocation({ id: 2, fundId: 4, amount: 600, incomePull: 60 }),
      ],
    });

    expect(isIncomeLike(ev)).toBe(true);
  });

  it("rejects an event with no allocations", () => {
    expect(isIncomeLike(event({ amount: 100 }))).toBe(false);
    expect(
      isIncomeLike(event({ children: [line({ walletId: 1, amount: 100 })] })),
    ).toBe(false);
  });

  it("rejects allocations that take money out", () => {
    expect(
      isIncomeLike(event({ children: [allocation({ amount: -100 })] })),
    ).toBe(false);
  });

  it("rejects allocations spread over more than one wallet", () => {
    const ev = event({
      children: [
        allocation({ id: 1, walletId: 1 }),
        allocation({ id: 2, walletId: 2 }),
      ],
    });

    expect(isIncomeLike(ev)).toBe(false);
  });
});
