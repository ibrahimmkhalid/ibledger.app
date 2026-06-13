import "dotenv/config";

import { and, asc, eq, isNull } from "drizzle-orm";

import { transactions, users } from "../src/db/schema";

type TxRow = {
  id: number;
  userId: number;
  parentId: number | null;
  occurredAt: Date | string;
  description: string | null;
  amount: number;
  isPosting: boolean;
  isPending: boolean;
  walletId: number | null;
  fundId: number | null;
};

type EventRow = {
  id: number;
  userId: number;
  occurredAt: Date;
  description: string | null;
  amount: number;
  isPending: boolean;
  children: TxRow[];
};

type SubscriptionCandidate = {
  source: "periodicity" | "text" | "merged";
  userId: number;
  username: string;
  email: string;
  descriptionKey: string;
  displayName: string;
  sign: number;
  descriptionVariants: string[];
  descriptionModeShare: number;
  count: number;
  firstDate: string;
  lastDate: string;
  nextExpectedDate: string | null;
  medianIntervalDays: number | null;
  cadence: string;
  medianAmount: number;
  minAmount: number;
  maxAmount: number;
  amountSpreadPct: number;
  score: number;
  eventIds: number[];
  dates: string[];
};

type MergedSubscriptionCandidate = SubscriptionCandidate & {
  aliases: string[];
  sourceLabels: string[];
};

const STOP_WORDS = new Set([
  "ach",
  "amex",
  "annual",
  "app",
  "auto",
  "auth",
  "bill",
  "card",
  "cash",
  "ca",
  "co",
  "company",
  "corp",
  "corporation",
  "credit",
  "debit",
  "discover",
  "googlepay",
  "inc",
  "llc",
  "mastercard",
  "monthly",
  "mobile",
  "online",
  "payment",
  "pos",
  "preauth",
  "purchase",
  "recurring",
  "renew",
  "renewal",
  "service",
  "services",
  "shop",
  "square",
  "subscription",
  "subscriptions",
  "txn",
  "transaction",
  "usa",
  "us",
  "venmo",
  "visa",
  "web",
  "zelle",
]);

const LEADING_PREFIXES = new Set([
  "ach",
  "amex",
  "atm",
  "card",
  "cash",
  "credit",
  "debit",
  "payment",
  "pos",
  "purchase",
  "stripe",
  "subscription",
  "subscriptions",
  "venmo",
  "visa",
  "mastercard",
  "paypal",
  "square",
  "zelle",
]);

function parseCliArgs(argv: string[]) {
  const flags: Record<string, string> = {};
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a) continue;

    if (a.startsWith("--")) {
      const [kRaw, vRaw] = a.slice(2).split("=", 2);
      const key = kRaw?.trim();
      if (!key) continue;

      if (vRaw !== undefined) {
        flags[key] = vRaw;
        continue;
      }

      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = "true";
      }

      continue;
    }

    positional.push(a);
  }

  return { flags, positional };
}

function toDate(input: Date | string): Date {
  if (input instanceof Date) return input;
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date: ${String(input)}`);
  }
  return parsed;
}

function formatDate(input: Date): string {
  return input.toISOString().slice(0, 10);
}

function formatMoney(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  return `${sign}$${Math.abs(amount).toFixed(2)}`;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? null;
  const left = sorted[mid - 1];
  const right = sorted[mid];
  return left === undefined || right === undefined ? null : (left + right) / 2;
}

function daysBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / 86_400_000;
}

function addDays(date: Date, days: number): Date {
  const out = new Date(date.getTime());
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

function normalizeDescription(input: string | null | undefined): string | null {
  if (!input) return null;

  const rawTokens = input
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !/^\d+$/.test(token));

  const tokens = [...rawTokens];
  while (tokens.length > 0 && LEADING_PREFIXES.has(tokens[0]!)) {
    tokens.shift();
  }

  const filtered = tokens.filter((token) => !STOP_WORDS.has(token));
  if (filtered.length === 0) return null;

  return filtered.slice(0, 3).join(" ");
}

function collapseEventDescription(event: EventRow): string | null {
  const root = event.description?.trim();
  if (root) return root;

  const childDescriptions = Array.from(
    new Set(
      event.children
        .map((child) => child.description?.trim() ?? "")
        .filter(Boolean),
    ),
  );

  if (childDescriptions.length === 0) return null;
  return childDescriptions.slice(0, 3).join(" / ");
}

function collectDescriptionStats(events: EventRow[]) {
  const counts = new Map<string, number>();
  const displayByKey = new Map<string, string>();

  for (const event of events) {
    const raw = collapseEventDescription(event)?.trim();
    if (!raw) continue;

    const key = raw.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (!displayByKey.has(key)) {
      displayByKey.set(key, raw);
    }
  }

  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const descriptionVariants = entries.map(([key]) => displayByKey.get(key) ?? key);
  const winner = entries[0];

  if (!winner) {
    return {
      displayName: null as string | null,
      descriptionKey: null as string | null,
      descriptionVariants: [] as string[],
      descriptionModeShare: 0,
    };
  }

  const [winningKey, winningCount] = winner;
  const displayName = displayByKey.get(winningKey) ?? winningKey;
  const descriptionKey = normalizeDescription(displayName) ?? winningKey;

  return {
    displayName,
    descriptionKey,
    descriptionVariants,
    descriptionModeShare: winningCount / Math.max(1, events.length),
  };
}

function computeEventAmount(event: EventRow): number {
  if (event.children.length === 0) {
    return Number(event.amount);
  }

  const walletDelta = event.children
    .filter((child) => child.walletId !== null)
    .reduce((acc, child) => acc + Number(child.amount), 0);

  if (Math.abs(walletDelta) > 0.000001) {
    return walletDelta;
  }

  const fundDelta = event.children
    .filter((child) => child.fundId !== null)
    .reduce((acc, child) => acc + Number(child.amount), 0);

  if (Math.abs(fundDelta) > 0.000001) {
    return fundDelta;
  }

  return event.children.reduce((acc, child) => acc + Number(child.amount), 0);
}

function computeEventChildren(rows: TxRow[]): EventRow[] {
  const roots = rows.filter((row) => row.parentId === null);
  const childrenByParentId = new Map<number, TxRow[]>();

  for (const row of rows) {
    if (row.parentId === null) continue;
    const list = childrenByParentId.get(row.parentId) ?? [];
    list.push(row);
    childrenByParentId.set(row.parentId, list);
  }

  return roots
    .map((root) => ({
      id: root.id,
      userId: root.userId,
      occurredAt: toDate(root.occurredAt),
      description: root.description,
      amount: Number(root.amount),
      isPending: Boolean(root.isPending),
      children: (childrenByParentId.get(root.id) ?? []).sort(
        (a, b) =>
          toDate(a.occurredAt).getTime() - toDate(b.occurredAt).getTime() ||
          a.id - b.id,
      ),
    }))
    .filter((event) => Math.abs(computeEventAmount(event)) > 0.000001);
}

function amountWithinTolerance(amount: number, baseline: number): boolean {
  const tolerance = Math.max(0.75, Math.abs(baseline) * 0.05);
  return Math.abs(amount - baseline) <= tolerance;
}

function classifyCadence(medianIntervalDays: number | null): string {
  if (medianIntervalDays === null) return "unknown";

  const bands: Array<[string, number, number]> = [
    ["weekly", 6, 8.5],
    ["biweekly", 13, 16.5],
    ["monthly", 27, 33.5],
    ["quarterly", 85, 95],
    ["yearly", 355, 370],
  ];

  for (const [label, min, max] of bands) {
    if (medianIntervalDays >= min && medianIntervalDays <= max) {
      return label;
    }
  }

  return `~${medianIntervalDays.toFixed(1)} days`;
}

function scoreSeries(args: {
  count: number;
  cadence: string;
  amountSpreadPct: number;
  medianIntervalDays: number | null;
  anyPending: boolean;
}): number {
  let score = 0;

  score += Math.min(30, args.count * 8);
  if (args.cadence !== "unknown" && !args.cadence.startsWith("~")) {
    score += 30;
  } else if (args.cadence.startsWith("~")) {
    score += 15;
  }

  if (args.amountSpreadPct <= 0.02) score += 20;
  else if (args.amountSpreadPct <= 0.05) score += 15;
  else if (args.amountSpreadPct <= 0.1) score += 8;

  if (args.medianIntervalDays !== null) {
    const proximity = Math.max(0, 15 - Math.abs(args.medianIntervalDays - Math.round(args.medianIntervalDays)));
    score += proximity;
  }

  if (!args.anyPending) score += 2;

  return score;
}

function buildCandidate(args: {
  source: "periodicity" | "text" | "merged";
  userId: number;
  username: string;
  email: string;
  events: EventRow[];
  displayName?: string | null;
  descriptionKey: string;
  descriptionVariants?: string[];
  descriptionModeShare?: number;
}): SubscriptionCandidate | null {
  const ordered = [...args.events].sort(
    (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() || a.id - b.id,
  );

  if (ordered.length < 3) return null;

  const amounts = ordered.map((event) => Math.abs(computeEventAmount(event)));
  const medianAmount = median(amounts);
  if (medianAmount === null || medianAmount <= 0) return null;

  const minAmount = Math.min(...amounts);
  const maxAmount = Math.max(...amounts);
  const amountSpreadPct = (maxAmount - minAmount) / medianAmount;

  const intervals = ordered
    .slice(1)
    .map((event, index) => daysBetween(ordered[index]!.occurredAt, event.occurredAt));
  const medianIntervalDays = median(intervals);

  const intervalMad =
    medianIntervalDays === null
      ? null
      : median(
          intervals.map((interval) => Math.abs(interval - medianIntervalDays)),
        );

  const cadence = classifyCadence(medianIntervalDays);
  const anyPending = ordered.some((event) => event.isPending);

  const regularEnough =
    intervals.length >= 2 &&
    (intervalMad === null || intervalMad <= (args.source === "periodicity" ? 5 : 4)) &&
    amountSpreadPct <= (args.source === "periodicity" ? 0.15 : 0.12);

  if (!regularEnough) return null;

  const score = scoreSeries({
    count: ordered.length,
    cadence,
    amountSpreadPct,
    medianIntervalDays,
    anyPending,
  });

  const minScore = args.source === "periodicity" ? 28 : 35;
  if (score < minScore) return null;

  const descriptionStats = collectDescriptionStats(ordered);
  const rootDescription =
    args.displayName ??
    descriptionStats.displayName ??
    ordered.map((event) => collapseEventDescription(event)).find((value): value is string => Boolean(value));

  const displayName = rootDescription ?? args.descriptionKey;
  const lastEvent = ordered[ordered.length - 1]!;
  const sign = ordered[0]!.amount < 0 ? -1 : 1;
  const nextExpectedDate =
    medianIntervalDays === null
      ? null
      : formatDate(addDays(lastEvent.occurredAt, Math.round(medianIntervalDays)));

  return {
    source: args.source,
    userId: args.userId,
    username: args.username,
    email: args.email,
    descriptionKey: args.descriptionKey,
    displayName,
    sign,
    descriptionVariants: args.descriptionVariants ?? descriptionStats.descriptionVariants,
    descriptionModeShare:
      args.descriptionModeShare ?? descriptionStats.descriptionModeShare,
    count: ordered.length,
    firstDate: formatDate(ordered[0]!.occurredAt),
    lastDate: formatDate(lastEvent.occurredAt),
    nextExpectedDate,
    medianIntervalDays:
      medianIntervalDays === null ? null : Number(medianIntervalDays.toFixed(1)),
    cadence,
    medianAmount: Number(medianAmount.toFixed(2)),
    minAmount: Number(minAmount.toFixed(2)),
    maxAmount: Number(maxAmount.toFixed(2)),
    amountSpreadPct: Number((amountSpreadPct * 100).toFixed(1)),
    score,
    eventIds: ordered.map((event) => event.id),
    dates: ordered.map((event) => formatDate(event.occurredAt)),
  };
}

function groupPeriodicityOnly(events: EventRow[]) {
  const bySign = new Map<number, EventRow[]>();

  for (const event of events) {
    const sign = computeEventAmount(event) < 0 ? -1 : 1;
    const list = bySign.get(sign) ?? [];
    list.push(event);
    bySign.set(sign, list);
  }

  const groups: EventRow[][] = [];

  for (const signEvents of bySign.values()) {
    const ordered = [...signEvents].sort(
      (a, b) =>
        Math.abs(computeEventAmount(a)) - Math.abs(computeEventAmount(b)) ||
        a.occurredAt.getTime() - b.occurredAt.getTime() ||
        a.id - b.id,
    );

    const clusters: EventRow[][] = [];
    const baselines: number[] = [];

    for (const event of ordered) {
      const amount = Math.abs(computeEventAmount(event));
      let placed = false;

      for (let i = 0; i < clusters.length; i++) {
        const baseline = baselines[i];
        if (baseline !== undefined && amountWithinTolerance(amount, baseline)) {
          clusters[i]!.push(event);
          const clusterAmounts = clusters[i]!.map((item) =>
            Math.abs(computeEventAmount(item)),
          );
          baselines[i] = median(clusterAmounts) ?? baseline;
          placed = true;
          break;
        }
      }

      if (!placed) {
        clusters.push([event]);
        baselines.push(amount);
      }
    }

    groups.push(...clusters);
  }

  return groups;
}

function tokenizeForMerge(input: string | null | undefined): string[] {
  if (!input) return [];

  return input
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !STOP_WORDS.has(token))
    .filter((token) => !/^\d+$/.test(token));
}

function textSimilarity(a: SubscriptionCandidate, b: SubscriptionCandidate): number {
  const tokensA = new Set(
    tokenizeForMerge(
      [a.displayName, a.descriptionKey, ...(a.descriptionVariants ?? [])].join(" "),
    ),
  );
  const tokensB = new Set(
    tokenizeForMerge(
      [b.displayName, b.descriptionKey, ...(b.descriptionVariants ?? [])].join(" "),
    ),
  );

  if (tokensA.size === 0 || tokensB.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) intersection++;
  }

  const union = new Set([...tokensA, ...tokensB]).size;
  const jaccard = intersection / Math.max(1, union);
  const minOverlap = intersection / Math.max(1, Math.min(tokensA.size, tokensB.size));

  const flatA = [...tokensA].join(" ");
  const flatB = [...tokensB].join(" ");
  const contains =
    flatA.includes(flatB) || flatB.includes(flatA) ? 1 : 0;

  return Math.max(jaccard, minOverlap, contains);
}

function cadenceClose(a: SubscriptionCandidate, b: SubscriptionCandidate): boolean {
  if (a.cadence === b.cadence) return true;
  if (a.medianIntervalDays === null || b.medianIntervalDays === null) return false;
  return Math.abs(a.medianIntervalDays - b.medianIntervalDays) <= 6;
}

function amountClose(a: SubscriptionCandidate, b: SubscriptionCandidate): boolean {
  const amountA = Math.abs(a.medianAmount);
  const amountB = Math.abs(b.medianAmount);
  const tolerance = Math.max(0.75, Math.max(amountA, amountB) * 0.05);
  return Math.abs(amountA - amountB) <= tolerance;
}

function shouldMergeCandidates(a: SubscriptionCandidate, b: SubscriptionCandidate): boolean {
  if (a.userId !== b.userId) return false;
  if (a.sign !== b.sign) return false;
  if (!amountClose(a, b)) return false;
  if (!cadenceClose(a, b)) return false;

  const similarity = textSimilarity(a, b);
  const relaxedThreshold =
    a.source === "periodicity" || b.source === "periodicity" ? 0.35 : 0.5;
  return similarity >= relaxedThreshold;
}

function uniq<T>(items: T[]) {
  return [...new Set(items)];
}

function uniqueEventsById(events: EventRow[]) {
  const byId = new Map<number, EventRow>();
  for (const event of events) {
    byId.set(event.id, event);
  }
  return [...byId.values()].sort(
    (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() || a.id - b.id,
  );
}

function buildMergedCandidate(args: {
  seeds: SubscriptionCandidate[];
  eventById: Map<number, EventRow>;
  userId: number;
  username: string;
  email: string;
}): MergedSubscriptionCandidate | null {
  const seedEvents = args.seeds.flatMap((seed) =>
    seed.eventIds
      .map((id) => args.eventById.get(id))
      .filter((event): event is EventRow => Boolean(event)),
  );
  const uniqueEvents = uniqueEventsById(seedEvents);
  if (uniqueEvents.length < 3) return null;

  const canonical = [...args.seeds].sort(
    (a, b) =>
      b.score - a.score ||
      (a.source === "text" ? 1 : 0) - (b.source === "text" ? 1 : 0) ||
      b.count - a.count ||
      a.displayName.localeCompare(b.displayName),
  )[0];

  if (!canonical) return null;

  const merged = buildCandidate({
    source: "merged",
    userId: args.userId,
    username: args.username,
    email: args.email,
    events: uniqueEvents,
    displayName: canonical.displayName,
    descriptionKey: canonical.descriptionKey,
    descriptionVariants: uniq(
      args.seeds.flatMap((seed) => seed.descriptionVariants ?? []),
    ),
    descriptionModeShare: Math.max(
      ...args.seeds.map((seed) => seed.descriptionModeShare ?? 0),
    ),
  });

  if (!merged) return null;

  return {
    ...merged,
    aliases: uniq(
      args.seeds
        .map((seed) => seed.displayName)
        .filter((label) => label && label !== canonical.displayName),
    ),
    sourceLabels: uniq(args.seeds.map((seed) => seed.source)),
  };
}

function mergeCandidates(args: {
  seeds: SubscriptionCandidate[];
  eventById: Map<number, EventRow>;
  userId: number;
  username: string;
  email: string;
}) {
  const parent = args.seeds.map((_, index) => index);

  const find = (x: number): number => {
    if (parent[x] === x) return x;
    parent[x] = find(parent[x]!);
    return parent[x]!;
  };

  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  for (let i = 0; i < args.seeds.length; i++) {
    for (let j = i + 1; j < args.seeds.length; j++) {
      const left = args.seeds[i];
      const right = args.seeds[j];
      if (!left || !right) continue;
      if (shouldMergeCandidates(left, right)) {
        union(i, j);
      }
    }
  }

  const groups = new Map<number, SubscriptionCandidate[]>();
  for (let i = 0; i < args.seeds.length; i++) {
    const root = find(i);
    const list = groups.get(root) ?? [];
    list.push(args.seeds[i]!);
    groups.set(root, list);
  }

  return [...groups.values()]
    .map((seeds) =>
      buildMergedCandidate({
        seeds,
        eventById: args.eventById,
        userId: args.userId,
        username: args.username,
        email: args.email,
      }),
    )
    .filter((candidate): candidate is MergedSubscriptionCandidate => candidate !== null)
    .sort((a, b) => b.score - a.score || b.count - a.count || a.displayName.localeCompare(b.displayName));
}

function groupByDescriptionAndAmount(events: EventRow[]) {
  const byKey = new Map<string, EventRow[]>();

  for (const event of events) {
    const rawDescription = collapseEventDescription(event);
    const normalized = normalizeDescription(rawDescription);
    if (!normalized) continue;

    const list = byKey.get(normalized) ?? [];
    list.push(event);
    byKey.set(normalized, list);
  }

  const candidates: Array<{
    descriptionKey: string;
    events: EventRow[];
  }> = [];

  for (const [descriptionKey, list] of byKey.entries()) {
    const ordered = [...list].sort(
      (a, b) =>
        Math.abs(computeEventAmount(a)) - Math.abs(computeEventAmount(b)) ||
        a.occurredAt.getTime() - b.occurredAt.getTime() ||
        a.id - b.id,
    );

    const clusters: EventRow[][] = [];
    const baselines: number[] = [];

    for (const event of ordered) {
      const amount = Math.abs(computeEventAmount(event));
      let placed = false;

      for (let i = 0; i < clusters.length; i++) {
        const baseline = baselines[i];
        if (baseline !== undefined && amountWithinTolerance(amount, baseline)) {
          clusters[i]!.push(event);
          const clusterAmounts = clusters[i]!.map((item) =>
            Math.abs(computeEventAmount(item)),
          );
          baselines[i] = median(clusterAmounts) ?? baseline;
          placed = true;
          break;
        }
      }

      if (!placed) {
        clusters.push([event]);
        baselines.push(amount);
      }
    }

    for (const cluster of clusters) {
      candidates.push({ descriptionKey, events: cluster });
    }
  }

  return candidates;
}

function buildPeriodicityCandidates(args: {
  userId: number;
  username: string;
  email: string;
  events: EventRow[];
}) {
  return groupPeriodicityOnly(args.events)
    .map((cluster) => {
      const stats = collectDescriptionStats(cluster);
      const amount = Math.abs(median(cluster.map((event) => Math.abs(computeEventAmount(event)))) ?? 0);
      const displayName =
        stats.displayName ?? (amount > 0 ? `Recurring ${formatMoney(amount)}` : "Recurring item");
      const descriptionKey =
        stats.descriptionKey ?? `periodic-${Math.round(amount * 100)}`;

      return buildCandidate({
        source: "periodicity",
        userId: args.userId,
        username: args.username,
        email: args.email,
        events: cluster,
        displayName,
        descriptionKey,
        descriptionVariants: stats.descriptionVariants,
        descriptionModeShare: stats.descriptionModeShare,
      });
    })
    .filter((candidate): candidate is SubscriptionCandidate => candidate !== null)
    .sort((a, b) => b.score - a.score || b.count - a.count || a.displayName.localeCompare(b.displayName));
}

function buildTextCandidates(args: {
  userId: number;
  username: string;
  email: string;
  events: EventRow[];
}) {
  return groupByDescriptionAndAmount(args.events)
    .map(({ descriptionKey, events }) => {
      const stats = collectDescriptionStats(events);
      return buildCandidate({
        source: "text",
        userId: args.userId,
        username: args.username,
        email: args.email,
        events,
        displayName: stats.displayName,
        descriptionKey,
        descriptionVariants: stats.descriptionVariants,
        descriptionModeShare: stats.descriptionModeShare,
      });
    })
    .filter((candidate): candidate is SubscriptionCandidate => candidate !== null)
    .sort((a, b) => b.score - a.score || b.count - a.count || a.displayName.localeCompare(b.displayName));
}

function isMergedCandidate(
  candidate: SubscriptionCandidate | MergedSubscriptionCandidate,
): candidate is MergedSubscriptionCandidate {
  return candidate.source === "merged";
}

function printCandidateSection(
  label: string,
  candidates:
    | SubscriptionCandidate[]
    | MergedSubscriptionCandidate[],
) {
  console.log(`  ${label}`);

  if (candidates.length === 0) {
    console.log("    No likely subscriptions found.");
    return;
  }

  for (const [index, candidate] of candidates.entries()) {
    const medianDisplay = candidate.sign * candidate.medianAmount;
    const maxDisplay = candidate.sign * candidate.maxAmount;
    const minDisplay = candidate.sign * candidate.minAmount;
    const sourceTag = candidate.source === "merged" ? "merged" : candidate.source;
    console.log(
      `    ${index + 1}. ${candidate.displayName} [${sourceTag}] | ${candidate.cadence} | count=${candidate.count} | amount=${formatMoney(medianDisplay)} | spread=${candidate.amountSpreadPct.toFixed(1)}% | score=${candidate.score}`,
    );
    console.log(
      `       dates: ${candidate.firstDate} -> ${candidate.lastDate}${candidate.nextExpectedDate ? ` | next ~${candidate.nextExpectedDate}` : ""}`,
    );
    console.log(
      `       events: ${candidate.eventIds.join(", ")} | amounts: ${formatMoney(maxDisplay)} .. ${formatMoney(minDisplay)}`,
    );
    if (isMergedCandidate(candidate) && candidate.aliases.length > 0) {
      console.log(`       aliases: ${candidate.aliases.join(" | ")}`);
    }
    if (isMergedCandidate(candidate) && candidate.sourceLabels.length > 0) {
      console.log(`       sources: ${candidate.sourceLabels.join(", ")}`);
    }
    if (candidate.descriptionModeShare < 1) {
      console.log(
        `       description mode share: ${(candidate.descriptionModeShare * 100).toFixed(0)}%`,
      );
    }
  }
}

function printUsage() {
  console.log(`Usage:
  npx tsx scripts/analyze-subscriptions.ts [--userId 123] [--limit 20] [--minCount 3] [--direction out|in|both] [--json]

Flags:
  --userId       Analyze one user only. If omitted, analyze all active users.
  --limit        Max candidates to print per user. Default: 20
  --minCount     Minimum occurrences required. Default: 3
  --direction    Filter by sign. Default: out
  --json         Emit JSON instead of human-readable text
  --help         Show this message
`);
}

async function loadTransactions(db: any, userId: number) {
  return db
    .select({
      id: transactions.id,
      userId: transactions.userId,
      parentId: transactions.parentId,
      occurredAt: transactions.occurredAt,
      description: transactions.description,
      amount: transactions.amount,
      isPosting: transactions.isPosting,
      isPending: transactions.isPending,
      walletId: transactions.walletId,
      fundId: transactions.fundId,
    })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), isNull(transactions.deletedAt)))
    .orderBy(asc(transactions.occurredAt), asc(transactions.id)) as Promise<TxRow[]>;
}

async function main() {
  const { flags, positional } = parseCliArgs(process.argv.slice(2));

  if (flags.help === "true" || flags.h === "true") {
    printUsage();
    return;
  }

  const userIdRaw = flags.userId ?? flags.user ?? positional[0];
  const limit = Number(flags.limit ?? 20);
  const minCount = Number(flags.minCount ?? 3);
  const direction = (flags.direction ?? "out").toLowerCase();
  const jsonMode = flags.json === "true";

  if (Number.isNaN(limit) || limit <= 0) {
    throw new Error(`Invalid --limit: ${String(flags.limit)}`);
  }

  if (Number.isNaN(minCount) || minCount < 2) {
    throw new Error(`Invalid --minCount: ${String(flags.minCount)}`);
  }

  if (!["out", "in", "both"].includes(direction)) {
    throw new Error(`Invalid --direction: ${direction}`);
  }

  const { db } = await import("../src/db");

  const userRows =
    userIdRaw !== undefined
      ? await db
          .select({
            id: users.id,
            username: users.username,
            email: users.email,
          })
          .from(users)
          .where(and(eq(users.id, Number(userIdRaw)), isNull(users.deletedAt)))
          .limit(1)
      : await db
          .select({
            id: users.id,
            username: users.username,
            email: users.email,
          })
          .from(users)
          .where(isNull(users.deletedAt))
          .orderBy(asc(users.id));

  if (userIdRaw !== undefined && userRows.length === 0) {
    throw new Error(`User not found (or deleted): userId=${String(userIdRaw)}`);
  }

  const results: Array<{
    userId: number;
    username: string;
    email: string;
    periodicity: SubscriptionCandidate[];
    text: SubscriptionCandidate[];
    merged: (SubscriptionCandidate & {
      aliases: string[];
      sourceLabels: string[];
    })[];
  }> = [];

  for (const user of userRows) {
    const rows = await loadTransactions(db, user.id);
    const events = computeEventChildren(rows);
    const eventById = new Map(events.map((event) => [event.id, event]));

    const signedEvents = events.filter((event) => {
      const amount = computeEventAmount(event);
      if (Math.abs(amount) < 0.000001) return false;
      if (direction === "both") return true;
      if (direction === "out") return amount < 0;
      return amount > 0;
    });

    const periodicityAll = buildPeriodicityCandidates({
      userId: user.id,
      username: user.username,
      email: user.email,
      events: signedEvents,
    });

    const textAll = buildTextCandidates({
      userId: user.id,
      username: user.username,
      email: user.email,
      events: signedEvents,
    });

    const mergedAll = mergeCandidates({
      seeds: [...periodicityAll, ...textAll],
      eventById,
      userId: user.id,
      username: user.username,
      email: user.email,
    });

    results.push({
      userId: user.id,
      username: user.username,
      email: user.email,
      periodicity: periodicityAll.slice(0, limit),
      text: textAll.slice(0, limit),
      merged: mergedAll.slice(0, limit),
    });
  }

  if (jsonMode) {
    console.log(
      JSON.stringify(
        results.map((result) => ({
          ...result,
          periodicity: result.periodicity,
          text: result.text,
          merged: result.merged,
        })),
        null,
        2,
      ),
    );
    return;
  }

  if (results.length === 0) {
    console.log("No active users found.");
    return;
  }

  for (const result of results) {
    console.log(`User ${result.userId} (${result.username} <${result.email}>)`);

    printCandidateSection("Pass 1: periodicity-only", result.periodicity);
    printCandidateSection("Pass 2: current text method", result.text);
    printCandidateSection("Pass 3: fuzzy merged families", result.merged);
    console.log("");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
