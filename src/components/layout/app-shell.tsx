"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Inter, Merriweather } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  weight: ["600"],
});

const merriweather = Merriweather({
  subsets: ["latin"],
  weight: ["400", "700"],
});

import {
  SignedIn,
  SignedOut,
  SignInButton,
  SignUpButton,
  UserButton,
  useAuth,
} from "@clerk/nextjs";

import { Button, buttonVariants } from "@/components/ui/button";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { syncBootstrapIdentity } from "@/app/tracker/lib/bootstrap";

// Reports the Clerk user id to the bootstrap cache so a session switch that
// happens without a full page load drops the previous user's cached result.
// Split out (and only mounted when Clerk is) because useAuth needs a provider.
function BootstrapIdentitySync() {
  const { isLoaded, userId } = useAuth();
  useEffect(() => {
    if (isLoaded) syncBootstrapIdentity(userId ?? null);
  }, [isLoaded, userId]);
  return null;
}

const NAV_ITEMS = [
  { href: "/tracker", label: "Overview" },
  { href: "/tracker/transactions", label: "Transactions" },
  { href: "/tracker/analytics", label: "Analytics" },
  { href: "/tracker/funds", label: "Funds" },
  { href: "/tracker/wallets", label: "Wallets" },
] as const;

function navLinkClassName(args: { href: string; pathname: string }) {
  const active = args.pathname === args.href;
  return [
    "text-sm",
    "px-3",
    "sm:px-2",
    "py-2.5",
    "sm:py-1",
    "rounded-md",
    "whitespace-nowrap",
    active
      ? "bg-muted font-semibold"
      : "text-muted-foreground hover:text-foreground",
  ].join(" ");
}

function NavLinks({ pathname }: { pathname: string }) {
  return NAV_ITEMS.map((item) => (
    <Link
      key={item.href}
      href={item.href}
      aria-current={pathname === item.href ? "page" : undefined}
      className={navLinkClassName({ href: item.href, pathname })}
    >
      {item.label}
    </Link>
  ));
}

export function AppShell(args: {
  children: React.ReactNode;
  devTesting: boolean;
}) {
  const { children, devTesting } = args;
  const pathname = usePathname();
  const inTracker = pathname.startsWith("/tracker");
  const year = new Date().getFullYear();

  // Keep the active item visible in the horizontally-scrolling mobile nav.
  const mobileNavRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const active = mobileNavRef.current?.querySelector('[aria-current="page"]');
    active?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [pathname]);

  return (
    <div className="bg-background flex min-h-screen flex-col">
      {!devTesting && <BootstrapIdentitySync />}
      <header className="bg-background/80 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 border-b backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link
              href={inTracker ? "/tracker" : "/"}
              className={`${inter.className} focus-visible:ring-ring/50 rounded-sm text-base font-semibold tracking-tighter focus-visible:ring-2 focus-visible:outline-none`}
            >
              ib
              <span className={`${merriweather.className} tracking-normal`}>
                Ledger
              </span>
            </Link>
            {inTracker && (
              <nav className="hidden items-center gap-1 sm:flex">
                <NavLinks pathname={pathname} />
              </nav>
            )}
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
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
                      Open your ledger
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
            <nav
              ref={mobileNavRef}
              aria-label="Sections"
              className="mx-auto flex w-full max-w-6xl items-center justify-start gap-1 overflow-x-auto [mask-image:linear-gradient(to_right,transparent,black_16px,black_calc(100%-16px),transparent)] px-4 py-1.5 whitespace-nowrap [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              <NavLinks pathname={pathname} />
            </nav>
          </div>
        )}
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t">
        <div className="text-muted-foreground mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-6 text-xs">
          <div>{year}</div>
          <Link
            href="/"
            className="hover:text-foreground focus-visible:ring-ring/50 rounded-sm focus-visible:ring-2 focus-visible:outline-none"
          >
            ibLedger
          </Link>
        </div>
      </footer>
    </div>
  );
}
