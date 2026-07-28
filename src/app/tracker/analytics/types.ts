import type { AnalyticsPageFilters } from "@/app/tracker/lib/analytics-page-query";

export type GroupBy = "day" | "week" | "month";

export type TrendMode = "cumulative" | "raw";

export type GranularityLevel = "fine" | "medium" | "coarse";

export type DateRangePreset =
  | "all"
  | "last_week"
  | "last_month"
  | "last_3_months"
  | "last_6_months"
  | "last_year"
  | "ytd";

export type AnalyticsFilters = AnalyticsPageFilters & {
  startDate: string;
  endDate: string;
  groupBy: GroupBy;
};

export type AnalyticsFilterDraft = Omit<
  AnalyticsFilters,
  "minAmount" | "maxAmount"
> & {
  minAmount: string;
  maxAmount: string;
  datePreset: DateRangePreset;
  granularityLevel: GranularityLevel;
};

export type MoneyTotal = {
  income: number;
  spending: number;
  net: number;
  cleared: number;
  withPending: number;
  pending: number;
  count: number;
};

export type AnalyticsResponse = {
  groupBy: GroupBy;
  range: {
    startDate: string | null;
    endDate: string | null;
    firstTransactionAt: string | null;
    lastTransactionAt: string | null;
  };
  summary: MoneyTotal;
  timeSeries: Array<
    MoneyTotal & {
      period: string;
      label: string;
    }
  >;
  walletSeries: TrendSeries[];
  fundSeries: TrendSeries[];
  categorizedSpending: SpendingRow[];
  walletSpending: SpendingRow[];
};

export type TrendSeries = {
  id: number;
  name: string;
  total: number;
  spending: number;
  income: number;
  points: Array<{
    period: string;
    label: string;
    value: number;
    cumulative: number;
    raw: number;
  }>;
};

export type SpendingRow = {
  id: number;
  name: string;
  spending: number;
  income: number;
  net: number;
  share: number;
};
export type AxisPoint = { label: string; period: string };
