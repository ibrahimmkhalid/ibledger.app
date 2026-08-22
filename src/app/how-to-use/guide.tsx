import {
  ArrowLeftRightIcon,
  ClockIcon,
  CoinsIcon,
  KeyboardIcon,
  ListIcon,
  PercentIcon,
  PiggyBankIcon,
  ScaleIcon,
  SettingsIcon,
  TagIcon,
  TagsIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Swatch } from "@/components/ui/swatch";
import { fmtAmount, fmtDateShort } from "@/app/tracker/lib/format";
import { SAVINGS_COLOR, seriesColor } from "@/app/tracker/lib/series-colors";

const HATCH =
  "repeating-linear-gradient(-45deg,transparent,transparent 3px,rgba(255,255,255,.18) 3px,rgba(255,255,255,.18) 6px)";

// Fixed, because the guide renders as both a server and a client component and
// a local midnight would be a different instant in each.
const EXAMPLE_DATE = new Date(Date.UTC(2026, 0, 12));

const GROCERIES = seriesColor(2);
const RENT = seriesColor(0);

function Section(args: {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}) {
  const { icon: Icon, title, children } = args;
  return (
    // From lg up the heading takes its own column so the prose stays capped
    // inside the app's full-width container.
    <section className="border-border grid gap-x-8 gap-y-3 border-t pt-8 lg:grid-cols-[14rem_minmax(0,1fr)]">
      <div className="flex items-start gap-2">
        <Icon aria-hidden className="text-primary mt-0.5 size-4 shrink-0" />
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      <div className="text-muted-foreground max-w-2xl space-y-3 text-sm">
        {children}
      </div>
    </section>
  );
}

function Figure(args: { children: React.ReactNode; caption?: string }) {
  return (
    <figure className="my-4 last:mb-0">
      <div className="border-border bg-muted/20 rounded-lg border p-4">
        {args.children}
      </div>
      {args.caption ? (
        <figcaption className="text-muted-foreground mt-2 text-xs">
          {args.caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

// A transaction exactly as the tracker renders it: the meta line names the
// wallet and fund it picked, matching TransactionEventCard.
function ExampleTransaction() {
  return (
    <Card size="sm" className="min-h-11 gap-1 py-1.5">
      <div className="px-3">
        <div className="flex items-baseline justify-between gap-3">
          <div className="text-muted-foreground min-w-0 truncate text-xs">
            <span className="tabular-nums">
              {fmtDateShort(EXAMPLE_DATE)} · Checking · Groceries
            </span>
          </div>
          <div className="text-destructive text-sm tabular-nums">
            {fmtAmount(-42.18)}
          </div>
        </div>
        <div className="mt-0.5 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <TagIcon
              aria-hidden
              className="text-muted-foreground mt-[2px] size-3.5 shrink-0 opacity-65"
            />
            <div className="min-w-0 truncate text-sm font-medium">
              Market run
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

// The three icons a transaction card can carry, with what each one means.
function CardIconLegend() {
  const rows: Array<{ icon: LucideIcon; label: string; meaning: string }> = [
    {
      icon: TagIcon,
      label: "Single line",
      meaning: "one wallet, one fund, one amount",
    },
    {
      icon: TagsIcon,
      label: "Several lines",
      meaning: "split across more than one line",
    },
    {
      icon: CoinsIcon,
      label: "Income",
      meaning: "money in, divided by your income shares",
    },
  ];

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.label} className="flex items-baseline gap-2 text-xs">
          <row.icon
            aria-hidden
            className="text-muted-foreground size-3.5 shrink-0 translate-y-0.5"
          />
          <span className="text-foreground w-28 shrink-0 font-semibold">
            {row.label}
          </span>
          <span className="min-w-0">{row.meaning}</span>
        </div>
      ))}
    </div>
  );
}

function BalanceColumn(args: {
  heading: string;
  rows: Array<{ name: string; amount: number }>;
}) {
  const total = args.rows.reduce((sum, row) => sum + row.amount, 0);
  return (
    <div className="flex min-w-0 flex-col">
      <div className="text-foreground text-xs font-semibold">
        {args.heading}
      </div>
      <div className="mt-2 flex-1 space-y-1">
        {args.rows.map((row) => (
          <div
            key={row.name}
            className="flex items-baseline justify-between gap-3 text-xs"
          >
            <span className="min-w-0 truncate">{row.name}</span>
            <span className="tabular-nums">{fmtAmount(row.amount)}</span>
          </div>
        ))}
      </div>
      <div className="border-border text-foreground mt-2 flex items-baseline justify-between gap-3 border-t pt-2 text-xs font-semibold">
        <span>Total</span>
        <span className="tabular-nums">{fmtAmount(total)}</span>
      </div>
    </div>
  );
}

// The allocation bar as it appears on the Funds page: one segment per fund,
// savings hatched and sized by whatever the others leave behind.
function AllocationBar() {
  const segments = [
    { name: "Groceries", pct: 25, color: GROCERIES, savings: false },
    { name: "Rent", pct: 40, color: RENT, savings: false },
    { name: "Savings", pct: 35, color: SAVINGS_COLOR, savings: true },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="border-border bg-muted/20 flex h-11 gap-1 overflow-hidden rounded-md border p-1">
        {segments.map((segment) => (
          <div
            key={segment.name}
            className="flex items-center justify-center overflow-hidden rounded-sm"
            style={{
              width: `${segment.pct}%`,
              backgroundColor: segment.color.bg,
              ...(segment.savings ? { backgroundImage: HATCH } : {}),
            }}
          >
            <span
              className="truncate px-1 text-xs font-semibold"
              style={{ color: segment.color.fg }}
            >
              {segment.name} {segment.pct}%
            </span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {segments.map((segment) => (
          <div key={segment.name} className="flex items-center gap-1.5 text-xs">
            <Swatch color={segment.color.bg} hatched={segment.savings} />
            <span className="text-foreground font-medium">{segment.name}</span>
            <span className="tabular-nums">
              {fmtAmount((2000 * segment.pct) / 100)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function KeystrokeRow(args: { typed: string; result: string }) {
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="border-border bg-background inline-flex w-20 justify-center rounded-md border px-2 py-1 font-mono tabular-nums">
        {args.typed}
      </span>
      <span aria-hidden className="text-muted-foreground">
        →
      </span>
      <span className="text-foreground font-semibold tabular-nums">
        {args.result}
      </span>
    </div>
  );
}

// The cleared/pending notation the balance tables use, pulled apart.
function ClearedPendingFigure() {
  return (
    <div className="flex flex-col gap-3">
      <div className="text-xl tabular-nums">
        <span className="font-semibold">{fmtAmount(590)}</span>
        <span className="text-muted-foreground ml-2">[+$190.00]</span>
      </div>
      <div className="space-y-1.5 text-xs">
        <div className="flex items-baseline gap-2">
          <span className="text-foreground w-24 shrink-0 font-semibold tabular-nums">
            {fmtAmount(590)}
          </span>
          <span>cleared — money that has actually settled</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="w-24 shrink-0 tabular-nums">[+$190.00]</span>
          <span>pending — on its way in, not counted yet</span>
        </div>
      </div>
    </div>
  );
}

function OverspentFigure() {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-foreground font-medium">Spending</span>
          <span className="text-2xs bg-destructive/10 text-destructive inline-flex items-center rounded-full px-2 py-0.5 font-semibold">
            Overspent {fmtAmount(42)}
          </span>
        </div>
        <span className="text-foreground font-semibold tabular-nums">
          {fmtAmount(0)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="text-foreground font-medium">Savings</span>
        <span className="text-foreground font-semibold tabular-nums">
          {fmtAmount(258)}
        </span>
      </div>
    </div>
  );
}

/** The guide with no page chrome, rendered at /how-to-use and in onboarding. */
export function HowToUseGuide() {
  return (
    <div className="flex flex-col gap-8">
      <Section icon={ScaleIcon} title="Wallets and funds">
        <p>
          Every transaction line picks a{" "}
          <span className="text-foreground font-medium">wallet</span> — where
          the money sits — and a{" "}
          <span className="text-foreground font-medium">fund</span> — what the
          money is for.
        </p>

        <Figure caption="One line, two answers: it left Checking, and it came out of the Groceries budget.">
          <ExampleTransaction />
        </Figure>

        <p>
          Because every line picks one of each, your wallet balances and your
          fund balances always come to the same total. They are two views of the
          same money.
        </p>

        <Figure caption="Same $1,300, sorted two different ways.">
          <div className="grid grid-cols-2 gap-6">
            <BalanceColumn
              heading="Wallets"
              rows={[
                { name: "Checking", amount: 1240 },
                { name: "Cash", amount: 60 },
              ]}
            />
            <BalanceColumn
              heading="Funds"
              rows={[
                { name: "Groceries", amount: 300 },
                { name: "Rent", amount: 900 },
                { name: "Savings", amount: 100 },
              ]}
            />
          </div>
        </Figure>

        <p>
          Savings is a special fund. It can&apos;t be deleted, and it catches
          whatever the other funds don&apos;t claim.
        </p>
      </Section>

      <Section icon={SettingsIcon} title="Setting up">
        <p>
          Add every account your money actually sits in as a wallet, and add a
          fund for each thing you set money aside for. You start with a Bank
          wallet and a Savings fund — rename them, add your own, or head
          straight to the tracker.
        </p>
        <p>
          Nothing you choose here is permanent. Wallets and funds can be
          renamed, added, or removed later from the Wallets and Funds pages.
        </p>
        <p>
          A new ledger starts at $0.00, so if you already have money in these
          accounts, record it once as your first transaction — one line per
          wallet, direction{" "}
          <span className="text-foreground font-medium">In</span>, for the
          amount sitting there. Put it against{" "}
          <span className="text-foreground font-medium">Savings</span> unless it
          is already earmarked for something. Money entered as a transaction
          isn&apos;t split by your income shares, so it lands exactly where you
          put it.
        </p>
      </Section>

      <Section icon={PercentIcon} title="Income shares">
        <p>
          Each fund other than Savings has an{" "}
          <span className="text-foreground font-medium">income share</span>: the
          percentage of each paycheck that flows into it. Savings keeps whatever
          is left over, so the shares always add up to 100%.
        </p>

        <Figure caption="A $2,000 paycheck splitting itself. Savings takes the 35% the other funds didn't claim.">
          <AllocationBar />
        </Figure>

        <p>
          Set the shares on the Funds page. Drag a divider on the allocation
          bar, or focus a divider and use the arrow keys — hold Shift for bigger
          steps. Nothing is saved until you press Confirm, and Revert undoes
          every change.
        </p>
        <p>
          When you record income it splits itself by those shares. Open an
          income entry to see the breakdown.
        </p>
      </Section>

      <Section icon={KeyboardIcon} title="Entering amounts">
        <p>
          Amount fields fill in cents-first, so there is no decimal point to
          type. This is true of every amount field in the app, including the
          Minimum and Maximum filters on the Transactions page.
        </p>

        <Figure>
          <div className="space-y-2">
            <KeystrokeRow typed="4200" result="$42.00" />
            <KeystrokeRow typed="5" result="$0.05" />
            <KeystrokeRow typed="120000" result="$1,200.00" />
          </div>
        </Figure>
      </Section>

      <Section icon={ClockIcon} title="Pending and cleared">
        <p>
          Turn on <span className="text-foreground font-medium">Pending</span>{" "}
          for money that hasn&apos;t settled yet. Pending amounts stay out of
          your cleared balance until you clear them.
        </p>

        <Figure caption="Every balance in the app reads this way — the settled figure first, the pending change in brackets.">
          <ClearedPendingFigure />
        </Figure>

        <p>
          To settle several at once, filter the Transactions page to Status
          &ldquo;Pending&rdquo; and use Clear pending. It settles exactly the
          transactions matching your filters — the button says how many — and
          leaves everything outside them pending. To settle the whole ledger in
          one go, use Clear all pending on the Overview instead.
        </p>
      </Section>

      <Section icon={TagsIcon} title="Transactions with several lines">
        <p>
          A single transaction can split across several wallets and funds. Use
          Add line in the transaction modal — each line carries its own wallet,
          fund, description, direction (in or out), amount, and pending flag.
          The editor shows a running net total as you go, so you can check what
          the whole entry comes to.
        </p>
        <p>
          The transaction counts as pending if any one of its lines is pending.
        </p>
      </Section>

      <Section icon={ListIcon} title="Reading a transaction card">
        <p>
          Every entry in a list carries a small icon on the left saying what
          kind of entry it is.
        </p>

        <Figure caption="The icon is the quickest way to tell an income entry from an ordinary one.">
          <CardIconLegend />
        </Figure>

        <p>
          The grey line above the description is the entry&apos;s meta line. It
          names the date, wallet and fund — and reads{" "}
          <span className="text-foreground font-medium">Multiple</span> in place
          of a name when the entry&apos;s lines span more than one wallet, or
          more than one fund. Open the entry to see which.
        </p>
        <p>
          A description in{" "}
          <span className="text-foreground font-medium italic">italics</span>{" "}
          means the transaction is still pending; the meta line spells that out
          too.
        </p>
      </Section>

      <Section icon={ArrowLeftRightIcon} title="Moving money between wallets">
        <p>
          There is no separate transfer screen. A transfer is one transaction
          with two lines that use the{" "}
          <span className="text-foreground font-medium">same fund</span> and
          opposite directions: an{" "}
          <span className="text-foreground font-medium">Out</span> line on the
          wallet the money leaves, and an{" "}
          <span className="text-foreground font-medium">In</span> line of the
          same amount on the wallet it arrives in.
        </p>
        <p>
          Keeping both lines on the same fund is what makes it a transfer rather
          than a spend: your wallet balances change, your fund balances
          don&apos;t, and the net total of the transaction comes to $0.00.
        </p>
        <p>
          This is also how you empty a wallet you want to delete — a wallet
          holding money can&apos;t be deleted.
        </p>
      </Section>

      <Section icon={TriangleAlertIcon} title="Overspending">
        <p>
          Funds don&apos;t go below $0. When one would, it floors at zero, shows
          an Overspent badge, and Savings covers the difference.
        </p>

        <Figure caption="Spending ran $42.00 past its budget, so it sits at $0.00 and Savings is $42.00 lighter.">
          <OverspentFigure />
        </Figure>

        <p>
          A badge marked &ldquo;pending&rdquo; means the fund is fine today, but
          goes past zero once its pending transactions clear.
        </p>
      </Section>

      <Section icon={PiggyBankIcon} title="Why Savings can go negative">
        <p>
          Savings is the buffer of last resort. Every other fund stops at $0.00
          and shows an Overspent badge, and the shortfall does not vanish — it
          is taken off Savings. Several overspent funds all come off the same
          place, so the figure on Savings is your own savings minus everything
          the other funds went over by.
        </p>
        <p>
          That is why Savings has no Overspent badge of its own, and why it is
          the one fund that can show a negative balance. A deeply negative
          Savings means the ledger as a whole has paid out more than it has
          taken in, not that one particular fund misbehaved.
        </p>
        <p>
          To bring it back: record the income you have not entered yet, or lower
          the other funds&apos; income shares so less is routed away from
          Savings in the first place.
        </p>
      </Section>

      <Section icon={Trash2Icon} title="Deleting wallets and funds">
        <p>
          A wallet or fund that still holds money — including pending money —
          can&apos;t be deleted. Move the money elsewhere and clear any pending
          transactions first.
        </p>
        <p>
          Savings can&apos;t be deleted, and you always keep at least one
          wallet.
        </p>
      </Section>
    </div>
  );
}
