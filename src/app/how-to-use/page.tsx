import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "How to use ibLedger",
};

function Section(args: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-border border-t pt-8">
      <h2 className="text-lg font-semibold">{args.title}</h2>
      <div className="text-muted-foreground mt-3 space-y-3 text-sm">
        {args.children}
      </div>
    </section>
  );
}

export default function HowToUsePage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:py-16">
      <h1 className="text-3xl font-semibold tracking-tight">
        How to use ibLedger
      </h1>
      <p className="text-muted-foreground mt-3 text-sm">
        Everything the app assumes you know, in one place.
      </p>

      <div className="mt-10 flex flex-col gap-8">
        <Section title="Wallets and funds">
          <p>
            Every transaction line picks a{" "}
            <span className="text-foreground font-medium">wallet</span> — where
            the money sits, like checking, cash, or a card — and a{" "}
            <span className="text-foreground font-medium">fund</span> — what the
            money is set aside for, like rent, groceries, or travel.
          </p>
          <p>
            Your wallet balances and your fund balances always add up to the
            same total. They are two views of the same money: one answers
            &ldquo;where is it?&rdquo;, the other answers &ldquo;what is it
            for?&rdquo;.
          </p>
          <p>
            Savings is a special fund. It cannot be deleted, and it catches
            whatever the other funds don&apos;t claim.
          </p>
        </Section>

        <Section title="Setting up">
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
        </Section>

        <Section title="Income shares">
          <p>
            Each fund other than Savings has an{" "}
            <span className="text-foreground font-medium">income share</span>:
            the percentage of each paycheck that flows into it. Savings keeps
            whatever is left over, so your shares always add up to 100%.
          </p>
          <p>
            Set them on the Funds page. Drag a divider on the allocation bar, or
            focus a divider and use the arrow keys — hold Shift for bigger
            steps. Nothing is saved until you press Confirm, and Revert undoes
            every change.
          </p>
          <p>
            When you record income, it is split across your funds by those
            shares automatically. Open an income entry to see the breakdown.
          </p>
        </Section>

        <Section title="Entering amounts">
          <p>
            Amount fields fill in cents-first. Type{" "}
            <span className="text-foreground font-medium tabular-nums">
              4200
            </span>{" "}
            for{" "}
            <span className="text-foreground font-medium tabular-nums">
              $42.00
            </span>
            , or{" "}
            <span className="text-foreground font-medium tabular-nums">5</span>{" "}
            for{" "}
            <span className="text-foreground font-medium tabular-nums">
              $0.05
            </span>
            . There is no decimal point to type.
          </p>
        </Section>

        <Section title="Pending and cleared">
          <p>
            Turn on <span className="text-foreground font-medium">Pending</span>{" "}
            for money that hasn&apos;t settled yet. Pending amounts stay out of
            your cleared balance until you clear them.
          </p>
          <p>
            Balances show the cleared total with the pending change in brackets.{" "}
            <span className="text-foreground font-medium tabular-nums">
              $590.00 [+$190.00]
            </span>{" "}
            means $590.00 has settled and another $190.00 is on its way in.
          </p>
          <p>
            To settle everything at once, filter the Transactions page to Status
            &ldquo;Pending&rdquo; and use Clear pending. It folds every pending
            transaction into your real balance right away.
          </p>
        </Section>

        <Section title="Transactions with several lines">
          <p>
            A single transaction can split across several wallets and funds. Use
            Add line in the transaction modal — each line carries its own wallet,
            fund, description, direction (in or out), amount, and pending flag.
          </p>
          <p>
            The transaction counts as pending if any one of its lines is
            pending.
          </p>
        </Section>

        <Section title="Overspending">
          <p>
            Funds don&apos;t go below $0. When one would, it shows an{" "}
            <span className="text-foreground font-medium">Overspent</span> badge
            and Savings covers the difference. The badge shows how far past zero
            the fund went.
          </p>
          <p>
            An Overspent badge marked &ldquo;pending&rdquo; means the fund
            doesn&apos;t go below $0 today, but will once its pending
            transactions clear.
          </p>
        </Section>

        <Section title="Deleting wallets and funds">
          <p>
            A wallet or fund that still holds money — including pending money —
            can&apos;t be deleted. Move the money elsewhere and clear any
            pending transactions first.
          </p>
          <p>
            Savings can&apos;t be deleted, and you always keep at least one
            wallet.
          </p>
        </Section>
      </div>
    </div>
  );
}
