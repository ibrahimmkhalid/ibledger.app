"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  SignedIn,
  SignedOut,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";

import { Button, buttonVariants } from "@/components/ui/button";

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

export function AppShell(args: {
  children: React.ReactNode;
  devTesting: boolean;
}) {
  const { children, devTesting } = args;
  const pathname = usePathname();
  const inTracker = pathname.startsWith("/tracker");
  const year = new Date().getFullYear();

  return (
    <div className="bg-background flex min-h-screen flex-col">
      <header className="bg-background/80 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 border-b backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-base font-semibold tracking-tight">
              Ledger
            </Link>
            {inTracker && (
              <nav className="hidden items-center gap-1 sm:flex">
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
                  className={navLinkClassName({
                    href: "/tracker/funds",
                    pathname,
                  })}
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
            )}
          </div>

          <div className="flex items-center gap-2">
            {devTesting ? (
              <div className="text-muted-foreground rounded-full border px-2 py-1 text-xs">
                Test User
              </div>
            ) : (
              <>
                <SignedOut>
                  <SignInButton>
                    <Button variant="outline" size="sm">
                      Sign in
                    </Button>
                  </SignInButton>
                  <SignUpButton>
                    <Button size="sm">Sign up</Button>
                  </SignUpButton>
                </SignedOut>
                <SignedIn>
                  {!inTracker && (
                    <Link
                      href="/tracker"
                      className={buttonVariants({
                        variant: "outline",
                        size: "sm",
                      })}
                    >
                      Open tracker
                    </Link>
                  )}
                  <UserButton afterSignOutUrl="/" />
                </SignedIn>
              </>
            )}
          </div>
        </div>

        {inTracker && (
          <div className="border-t sm:hidden">
            <nav className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2 px-4 py-2">
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
                Txns
              </Link>
              <Link
                href="/tracker/funds"
                className={navLinkClassName({
                  href: "/tracker/funds",
                  pathname,
                })}
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
        )}
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t">
        <div className="text-muted-foreground mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-6 text-xs">
          <div>{year}</div>
          <Link href="/" className="hover:text-foreground">
            Ibrahim&apos;s Ledger
          </Link>
        </div>
      </footer>
    </div>
  );
}
