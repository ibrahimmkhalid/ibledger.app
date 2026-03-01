import Link from "next/link";
import { SignedIn, SignedOut, SignInButton, SignUpButton } from "@clerk/nextjs";

import { Card } from "@/components/ui/card";

import { fmtAmount, fmtDateShort } from "@/app/tracker/lib/format";

function ExampleTransactionCard(args: {
  occurredAt: Date;
  walletName: string;
  fundName: string;
  description: string;
  net: number;
  pending?: boolean;
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
            {args.pending && <span> · pending</span>}
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
            <div className={"min-w-0 truncate text-sm font-medium"}>
              {args.description}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function Home() {
  const isDevTesting = process.env.DEV_TESTING === "true";
  const today = new Date();

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="bg-[radial-gradient(closest-side,theme(colors.primary/18),transparent)] absolute -top-24 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full blur-3xl" />
        <div className="bg-[radial-gradient(closest-side,theme(colors.chart-1/25),transparent)] absolute right-[-140px] -bottom-24 h-[420px] w-[420px] rounded-full blur-3xl" />
        <div className="bg-[linear-gradient(to_bottom,theme(colors.background),theme(colors.background),theme(colors.muted/35))] absolute inset-0" />
      </div>

      <section className="mx-auto w-full max-w-6xl px-4 pt-12 pb-10 sm:pt-16">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-700">
            <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              Track money by <span className="text-primary">where</span> it
              lives <span className="text-muted-foreground">and</span>{" "}
              <span className="text-primary">why</span> it exists.
            </h1>
            <p className="text-muted-foreground mt-4 max-w-prose text-sm text-pretty sm:text-base">
              Wallets capture location (checking, cash, cards). Funds capture
              purpose (rent, food, travel). Every transaction line picks both.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              {isDevTesting ? (
                <Link
                  href="/tracker"
                  className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-semibold shadow-sm transition"
                >
                  Open tracker
                </Link>
              ) : (
                <>
                  <SignedIn>
                    <Link
                      href="/tracker"
                      className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-semibold shadow-sm transition"
                    >
                      Open tracker
                    </Link>
                  </SignedIn>
                  <SignedOut>
                    <SignUpButton>
                      <button className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-semibold shadow-sm transition">
                        Get started
                      </button>
                    </SignUpButton>
                    <SignInButton>
                      <button className="border-border bg-background hover:bg-muted inline-flex h-9 items-center justify-center rounded-md border px-4 text-sm font-semibold shadow-sm transition">
                        Sign in
                      </button>
                    </SignInButton>
                  </SignedOut>
                </>
              )}

              <Link
                href="#how-it-works"
                className="text-muted-foreground hover:text-foreground inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-semibold transition"
              >
                See how it works
              </Link>
            </div>

            <div className="text-muted-foreground mt-6 flex flex-wrap gap-2 text-xs">
              <span className="border-border bg-background/60 rounded-full border px-2 py-1">
                Wallet = where
              </span>
              <span className="border-border bg-background/60 rounded-full border px-2 py-1">
                Fund = why
              </span>
              <span className="border-border bg-background/60 rounded-full border px-2 py-1">
                Pending-aware totals
              </span>
            </div>
          </div>

          <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:delay-150 motion-safe:duration-700">
            <div className="border-border bg-card/70 rounded-2xl border p-4 shadow-sm backdrop-blur">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Example</div>
                <div className="text-muted-foreground text-xs">
                  Two transactions
                </div>
              </div>
              <div className="mt-3 grid gap-3">
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

              <div className="border-border bg-muted/40 mt-4 rounded-xl border p-3">
                <div className="text-muted-foreground text-xs">
                  The same dollars exist in a wallet and belong to a purpose.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        id="how-it-works"
        className="mx-auto w-full max-w-6xl px-4 pt-4 pb-10"
      >
        <div className="border-border bg-card/60 grid gap-6 rounded-2xl border p-6 shadow-sm backdrop-blur sm:p-8">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">
              How it works
            </h2>
            <p className="text-muted-foreground mt-2 max-w-prose text-sm">
              A simple loop: set structure once, then capture reality fast.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="border-border bg-background/60 rounded-xl border p-4">
              <div className="text-muted-foreground text-xs font-semibold">
                01
              </div>
              <div className="mt-1 text-sm font-semibold">Create wallets</div>
              <div className="text-muted-foreground mt-2 text-xs">
                Checking, cash, cards, savings accounts.
              </div>
            </div>
            <div className="border-border bg-background/60 rounded-xl border p-4">
              <div className="text-muted-foreground text-xs font-semibold">
                02
              </div>
              <div className="mt-1 text-sm font-semibold">Create funds</div>
              <div className="text-muted-foreground mt-2 text-xs">
                Envelopes for rent, food, travel, subscriptions.
              </div>
            </div>
            <div className="border-border bg-background/60 rounded-xl border p-4">
              <div className="text-muted-foreground text-xs font-semibold">
                03
              </div>
              <div className="mt-1 text-sm font-semibold">
                Record transactions
              </div>
              <div className="text-muted-foreground mt-2 text-xs">
                Each line selects both a wallet (where) and a fund (why).
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 pb-10">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="border-border bg-card/60 rounded-2xl border p-6 shadow-sm backdrop-blur sm:p-8">
            <h2 className="text-xl font-semibold tracking-tight">
              Income pulls
            </h2>
            <p className="text-muted-foreground mt-2 text-sm">
              Route every paycheck automatically. Funds take their percentage.
              Savings receives the remainder.
            </p>

            <div className="mt-5">
              <div className="border-border bg-background/60 h-3 w-full overflow-hidden rounded-full border">
                <div className="flex h-full">
                  <div
                    className="h-full w-[35%]"
                    style={{ backgroundColor: "var(--chart-3)" }}
                  />
                  <div
                    className="h-full w-[20%]"
                    style={{ backgroundColor: "var(--chart-2)" }}
                  />
                  <div
                    className="h-full w-[15%]"
                    style={{ backgroundColor: "var(--chart-1)" }}
                  />
                  <div className="bg-primary/60 h-full flex-1" />
                </div>
              </div>
              <div className="text-muted-foreground mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block size-2 rounded-sm"
                    style={{ backgroundColor: "var(--chart-3)" }}
                  />
                  Rent 35%
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block size-2 rounded-sm"
                    style={{ backgroundColor: "var(--chart-2)" }}
                  />
                  Food 20%
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block size-2 rounded-sm"
                    style={{ backgroundColor: "var(--chart-1)" }}
                  />
                  Travel 15%
                </div>
                <div className="flex items-center gap-2">
                  <span className="bg-primary/60 inline-block size-2 rounded-sm" />
                  Savings remainder
                </div>
              </div>
            </div>
          </div>

          <div className="border-border bg-card/60 rounded-2xl border p-6 shadow-sm backdrop-blur sm:p-8">
            <h2 className="text-xl font-semibold tracking-tight">
              Overspending, made explicit
            </h2>
            <p className="text-muted-foreground mt-2 text-sm">
              Non-savings funds display a floor of $0, but you&apos;ll always
              see an Overspent badge when raw balances go negative.
            </p>
            <div className="mt-5 grid gap-3">
              <div className="border-border bg-background/60 rounded-xl border p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Dining out</div>
                  <div className="bg-destructive/10 text-destructive rounded-full px-2 py-0.5 text-[11px] font-semibold">
                    Overspent $18.00
                  </div>
                </div>
                <div className="text-muted-foreground mt-2 text-xs">
                  Displayed balance: $0.00 / Raw balance: -$18.00
                </div>
              </div>
              <div className="border-border bg-background/60 rounded-xl border p-4">
                <div className="text-sm font-semibold">
                  Savings absorbs deficits
                </div>
                <div className="text-muted-foreground mt-2 text-xs">
                  When a fund goes below zero, Savings reflects the real
                  shortfall.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 pb-16">
        <div className="border-border bg-card/60 rounded-2xl border p-6 shadow-sm backdrop-blur sm:p-8">
          <h2 className="text-xl font-semibold tracking-tight">
            Trust & privacy
          </h2>
          <div className="text-muted-foreground mt-2 grid gap-2 text-sm sm:grid-cols-3">
            <div className="border-border bg-background/60 rounded-xl border p-4">
              Auth via Clerk.
            </div>
            <div className="border-border bg-background/60 rounded-xl border p-4">
              Your data stays tied to your account.
            </div>
            <div className="border-border bg-background/60 rounded-xl border p-4">
              Pending-aware totals for honest forecasts.
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href="/tracker/onboarding"
              className="border-border bg-background hover:bg-muted inline-flex h-9 items-center justify-center rounded-md border px-4 text-sm font-semibold shadow-sm transition"
            >
              Take the tour
            </Link>
            <Link
              href="/tracker"
              className="text-muted-foreground hover:text-foreground inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-semibold transition"
            >
              Go to tracker
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
