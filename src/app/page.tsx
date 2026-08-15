import Link from "next/link";
import { SignedIn, SignedOut, SignInButton, SignUpButton } from "@clerk/nextjs";
import { FolderIcon, TagIcon, WalletIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import { fmtAmount, fmtDateShort } from "@/app/tracker/lib/format";
import { isDevTestingEnabled } from "@/lib/dev-testing";

// The hero CTA reuses the app Button but overrides the toolbar-dense `lg`
// sizing (which shrinks to h-8/text-xs at sm:) so the page's single primary
// action reads at full presence on desktop too.
const heroCtaClass =
  "h-12 rounded-lg px-6 text-base font-semibold sm:h-12 sm:px-6 sm:text-base";

// Mirrors the tracker's TransactionEventCard so the landing page shows the
// same card the app renders.
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
            <TagIcon
              aria-hidden
              className="text-muted-foreground mt-[2px] size-3.5 shrink-0 opacity-65"
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
  if (isDevTestingEnabled()) {
    return (
      <Button asChild size="lg" className={heroCtaClass}>
        <Link href="/tracker">Open your ledger</Link>
      </Button>
    );
  }

  return (
    <>
      <SignedIn>
        <Button asChild size="lg" className={heroCtaClass}>
          <Link href="/tracker">Open your ledger</Link>
        </Button>
      </SignedIn>
      <SignedOut>
        <SignUpButton>
          <Button size="lg" className={heroCtaClass}>
            Start your ledger
          </Button>
        </SignUpButton>
        <SignInButton>
          <Button variant="outline" size="lg" className={heroCtaClass}>
            Sign in
          </Button>
        </SignInButton>
      </SignedOut>
    </>
  );
}

function ConceptColumn(args: {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}) {
  const { icon: Icon, title, children } = args;
  return (
    <div>
      <div className="flex items-center justify-center gap-2 sm:justify-start">
        <Icon aria-hidden className="text-primary size-4 shrink-0" />
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <p className="text-muted-foreground mt-1 text-sm">{children}</p>
    </div>
  );
}

export default function Home() {
  const today = new Date();

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="bg-[radial-gradient(closest-side,theme(colors.primary/22),transparent)] dark:bg-[radial-gradient(closest-side,theme(colors.primary/16),transparent)] absolute -top-32 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full blur-3xl" />
      </div>

      <section className="mx-auto w-full max-w-3xl px-4 pt-20 pb-16 text-center sm:pt-28">
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Where your money sits.
          <br />
          <span className="text-primary">What it&apos;s for.</span>
        </h1>

        <p className="text-muted-foreground mx-auto mt-5 max-w-lg text-base text-pretty">
          ibLedger is a personal ledger where every transaction picks a{" "}
          <span className="text-foreground font-medium">wallet</span> (where the
          money sits) and a{" "}
          <span className="text-foreground font-medium">fund</span> (what
          it&apos;s for). One ledger, two answers.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <PrimaryCta />
        </div>
      </section>

      <section
        aria-labelledby="demo-heading"
        className="mx-auto w-full max-w-md px-4 pb-16"
      >
        <h2 id="demo-heading" className="sr-only">
          An example transaction
        </h2>
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
            The <span className="text-foreground">wallet</span> says where the
            money sits. The <span className="text-primary">fund</span> says what
            it&apos;s for.
          </p>
        </div>
      </section>

      <section
        aria-labelledby="concepts-heading"
        className="mx-auto w-full max-w-3xl px-4 pb-16"
      >
        <h2 id="concepts-heading" className="sr-only">
          The three building blocks
        </h2>
        <div className="grid gap-6 text-center sm:grid-cols-3 sm:gap-4 sm:text-left">
          <ConceptColumn icon={WalletIcon} title="Wallets">
            Checking, cash, cards. Where the money sits.
          </ConceptColumn>
          <ConceptColumn icon={FolderIcon} title="Funds">
            Rent, food, travel. What the money is for.
          </ConceptColumn>
          {/* Tag is the app's transaction glyph — the same one the example
              cards above carry, and the one the guide's card legend explains.
              ArrowLeftRight is reserved for transfers between wallets. */}
          <ConceptColumn icon={TagIcon} title="Transactions">
            Every line picks one of each. Both views stay balanced.
          </ConceptColumn>
        </div>
      </section>

      <section
        aria-labelledby="features-heading"
        className="mx-auto w-full max-w-3xl px-4 pb-20"
      >
        <div className="border-border bg-card/60 rounded-2xl border p-6 shadow-sm backdrop-blur sm:p-8">
          <h2 id="features-heading" className="sr-only">
            What the ledger does for you
          </h2>
          <div className="grid gap-6 sm:grid-cols-3 sm:gap-4">
            <div>
              <h3 className="text-sm font-semibold">
                Paychecks split themselves
              </h3>
              <p className="text-muted-foreground mt-1 text-sm">
                Set each fund&apos;s share once. Every paycheck allocates itself
                — no monthly re-budgeting.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold">
                Cleared and pending, side by side
              </h3>
              <p className="text-muted-foreground mt-1 text-sm">
                Always see what you can really spend, not just what&apos;s about
                to clear.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold">
                Overspending stays visible
              </h3>
              <p className="text-muted-foreground mt-1 text-sm">
                Funds floor at $0 and show an overspent badge, with Savings
                covering the gap — no category quietly goes negative.
              </p>
            </div>
          </div>

          <div className="border-border mt-8 flex flex-wrap items-center justify-center gap-3 border-t pt-8">
            <PrimaryCta />
          </div>
        </div>
      </section>
    </div>
  );
}
