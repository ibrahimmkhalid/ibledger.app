import Link from "next/link";
import { SignedIn, SignedOut, SignInButton, SignUpButton } from "@clerk/nextjs";

import { Card } from "@/components/ui/card";

import { fmtAmount, fmtDateShort } from "@/app/tracker/lib/format";

const CTA_PRIMARY_CLASS =
  "bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-semibold shadow-sm transition";

const CTA_SECONDARY_CLASS =
  "border-border bg-background hover:bg-muted inline-flex h-9 items-center justify-center rounded-md border px-4 text-sm font-semibold shadow-sm transition";

function ExampleTransactionCard(args: {
  occurredAt: Date;
  walletName: string;
  fundName: string;
  description: string;
  net: number;
}) {
  const meta = [fmtDateShort(args.occurredAt), args.walletName, args.fundName]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card size="sm" className="min-h-11 gap-1 py-1.5">
      <div className="px-3">
        <div className="flex items-baseline justify-between gap-3">
          <div className="text-muted-foreground min-w-0 truncate text-xs">
            <span className="tabular-nums">{meta}</span>
          </div>
          <div className="text-sm tabular-nums">
            <span className={args.net < 0 ? "text-destructive" : ""}>
              {fmtAmount(args.net)}
            </span>
          </div>
        </div>

        <div className="mt-0.5 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span
              aria-hidden
              className="bg-muted-foreground/25 mt-[2px] size-3.5 shrink-0 rounded-[3px]"
            />
            <div className="min-w-0 truncate text-sm font-medium">
              {args.description}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function PrimaryCta() {
  const isDevTesting = process.env.DEV_TESTING === "true";

  if (isDevTesting) {
    return (
      <Link href="/tracker" className={CTA_PRIMARY_CLASS}>
        Open your ledger
      </Link>
    );
  }

  return (
    <>
      <SignedIn>
        <Link href="/tracker" className={CTA_PRIMARY_CLASS}>
          Open your ledger
        </Link>
      </SignedIn>
      <SignedOut>
        <SignUpButton>
          <button className={CTA_PRIMARY_CLASS}>Start your ledger</button>
        </SignUpButton>
        <SignInButton>
          <button className={CTA_SECONDARY_CLASS}>Sign in</button>
        </SignInButton>
      </SignedOut>
    </>
  );
}

export default function Home() {
  const today = new Date();

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="bg-[radial-gradient(closest-side,theme(colors.primary/14),transparent)] absolute -top-32 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full blur-3xl" />
      </div>

      <section className="mx-auto w-full max-w-3xl px-4 pt-20 pb-16 text-center sm:pt-28">
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Where your money lives.
          <br />
          <span className="text-primary">Why it exists.</span>
        </h1>

        <p className="text-muted-foreground mx-auto mt-5 max-w-md text-base text-pretty">
          Every transaction lands in a wallet and belongs to a fund. One
          ledger, two answers.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <PrimaryCta />
        </div>
      </section>

      <section className="mx-auto w-full max-w-md px-4 pb-16">
        <div className="border-border bg-card/70 rounded-2xl border p-4 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-2">
            <ExampleTransactionCard
              occurredAt={today}
              walletName="Checking"
              fundName="Groceries"
              description="Market run"
              net={-42.18}
            />
            <ExampleTransactionCard
              occurredAt={today}
              walletName="Cash"
              fundName="Coffee"
              description="Quick stop"
              net={-4.5}
            />
          </div>
          <p className="text-muted-foreground mt-3 px-1 text-xs">
            Checking and Cash say <span className="text-foreground">where</span>
            . Groceries and Coffee say <span className="text-foreground">why</span>.
          </p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-3xl px-4 pb-16">
        <div className="grid gap-6 text-center sm:grid-cols-3 sm:gap-4 sm:text-left">
          <div>
            <div className="text-sm font-semibold">Wallets</div>
            <p className="text-muted-foreground mt-1 text-sm">
              Checking, cash, cards. Where the money sits.
            </p>
          </div>
          <div>
            <div className="text-sm font-semibold">Funds</div>
            <p className="text-muted-foreground mt-1 text-sm">
              Rent, food, travel. What the money is for.
            </p>
          </div>
          <div>
            <div className="text-sm font-semibold">Transactions</div>
            <p className="text-muted-foreground mt-1 text-sm">
              Every line picks one of each. Both views stay balanced.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-3xl px-4 pb-20">
        <div className="border-border bg-card/60 rounded-2xl border p-6 shadow-sm backdrop-blur sm:p-8">
          <div className="grid gap-6 sm:grid-cols-3 sm:gap-4">
            <div>
              <div className="text-sm font-semibold">
                Paychecks split themselves
              </div>
              <p className="text-muted-foreground mt-1 text-sm">
                Each fund pulls its percentage of income. Savings keeps the
                rest.
              </p>
            </div>
            <div>
              <div className="text-sm font-semibold">Pending-aware totals</div>
              <p className="text-muted-foreground mt-1 text-sm">
                Cleared and pending balances, always side by side.
              </p>
            </div>
            <div>
              <div className="text-sm font-semibold">
                Overspending is explicit
              </div>
              <p className="text-muted-foreground mt-1 text-sm">
                Funds floor at $0 and wear an overspent badge. Savings absorbs
                the difference.
              </p>
            </div>
          </div>

          <div className="border-border mt-8 flex flex-wrap items-center justify-between gap-3 border-t pt-6">
            <p className="text-muted-foreground text-xs">
              Sign in with Clerk. Your data stays tied to your account.
            </p>
            <Link
              href="/tracker/onboarding"
              className="text-muted-foreground hover:text-foreground text-xs font-semibold transition"
            >
              Take the tour →
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
