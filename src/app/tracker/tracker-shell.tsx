"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function navLinkClassName(args: { href: string; pathname: string }) {
  const active = args.pathname === args.href;
  return [
    "text-sm",
    "px-2",
    "py-1",
    "rounded-md",
    active
      ? "bg-muted font-semibold"
      : "text-muted-foreground hover:text-foreground",
  ].join(" ");
}

export function TrackerShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/tracker" className="text-base font-semibold">
            Tracker
          </Link>
          <nav className="flex items-center gap-1">
            <Link
              href="/tracker"
              className={navLinkClassName({ href: "/tracker", pathname })}
            >
              Overview
            </Link>
            <Link
              href="/tracker/transactions"
              className={navLinkClassName({
                href: "/tracker/transactions",
                pathname,
              })}
            >
              Transactions
            </Link>
            <Link
              href="/tracker/funds"
              className={navLinkClassName({ href: "/tracker/funds", pathname })}
            >
              Funds
            </Link>
            <Link
              href="/tracker/wallets"
              className={navLinkClassName({
                href: "/tracker/wallets",
                pathname,
              })}
            >
              Wallets
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
