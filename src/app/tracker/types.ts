export type TotalsResponse = {
  grandTotal: number;
  grandTotalWithPending: number;
  wallets: Array<{
    id: number;
    name: string;
    balance: number;
    balanceWithPending: number;
  }>;
  funds: Array<{
    id: number;
    name: string;
    kind: string;
    balance: number;
    balanceWithPending: number;
  }>;
};

export type Wallet = {
  id: number;
  name: string;
  openingAmount: number;
  balance: number;
  balanceWithPending: number;
};

export type Fund = {
  id: number;
  name: string;
  kind: string;
  openingAmount: number;
  balance: number;
  balanceWithPending: number;
};

export type TransactionLine = {
  id: number;
  parentId: number | null;
  occurredAt: string;
  description: string | null;
  isPending: boolean;
  status: string;
  amount: number;
  incomePull: number | null;
  walletId: number | null;
  walletName: string | null;
  fundId: number | null;
  fundName: string | null;
};

export type TransactionEvent = {
  id: number;
  occurredAt: string;
  description: string | null;
  amount: number;
  isPosting: boolean;
  isPending: boolean;
  status: string;
  incomePull: number | null;
  walletId: number | null;
  walletName: string | null;
  fundId: number | null;
  fundName: string | null;
  children: TransactionLine[];
};

export type EventsResponse = {
  events: TransactionEvent[];
  currentPage: number;
  nextPage: number;
};
