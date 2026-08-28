"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Inter, Merriweather } from "next/font/google";
import { ChevronDownIcon } from "lucide-react";

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
import {
  Popover,
  PopoverContent,
  PopoverSeparator,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import {
  getOnboardingRequired,
  subscribeOnboardingRequired,
  syncBootstrapIdentity,
} from "@/app/tracker/lib/bootstrap";

// Reports the Clerk user id to the bootstrap cache. Split out because useAuth
// needs a provider.
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
  { href: "/tracker/setup", label: "Setup" },
] as const;

// Help is not a section of the ledger, so it sits below a divider in the
// mobile menu and stays out of the desktop row.
const HELP_ITEM = { href: "/how-to-use", label: "How to use" } as const;

function DesktopNav({ pathname }: { pathname: string }) {
  return (
    <nav className="hidden items-center gap-1 sm:flex">
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={pathname === item.href ? "page" : undefined}
          className={`rounded-md px-2 py-1 text-sm whitespace-nowrap ${pathname === item.href ? "bg-muted font-semibold" : "text-muted-foreground hover:text-foreground"}`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

function MobileNav({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const current = [...NAV_ITEMS, HELP_ITEM].find(
    (item) => item.href === pathname,
  );

  function menuItem(item: { href: string; label: string }) {
    const active = pathname === item.href;
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setOpen(false)}
        aria-current={active ? "page" : undefined}
        className={`flex items-center rounded-md px-3 py-2.5 text-sm ${active ? "bg-muted font-semibold" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"}`}
      >
        {item.label}
      </Link>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="sm:hidden">
          {current?.label ?? "Menu"}
          <ChevronDownIcon data-icon="inline-end" />
        </Button>
      </PopoverTrigger>
      {/* Matches the trigger's breakpoint; the portal is outside the header. */}
      <PopoverContent className="w-44 sm:hidden">
        <nav aria-label="Sections" className="flex flex-col">
          {NAV_ITEMS.map(menuItem)}
          <PopoverSeparator />
          {menuItem(HELP_ITEM)}
        </nav>
      </PopoverContent>
    </Popover>
  );
}

export function AppShell(args: {
  children: React.ReactNode;
  devTesting: boolean;
}) {
  const { children, devTesting } = args;
  const pathname = usePathname();
  const inTracker = pathname.startsWith("/tracker");

  // Nav links bounce back to onboarding until setup is done, so hide them.
  // False until bootstrap answers.
  const onboardingRequired = useSyncExternalStore(
    subscribeOnboardingRequired,
    getOnboardingRequired,
    () => false,
  );

  // The guide is one of the nav destinations, so the nav has to survive
  // landing on it. Otherwise following the link strands the user there.
  const showSectionNav =
    (inTracker || pathname === "/how-to-use") && !onboardingRequired;
  const year = new Date().getFullYear();

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
            {showSectionNav && (
              <>
                <DesktopNav pathname={pathname} />
                <MobileNav pathname={pathname} />
              </>
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
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t">
        {/* The mobile FAB is fixed to the bottom-right of the viewport, which
            is exactly where these links land once the page is scrolled to the
            end. Enough padding to clear it keeps them tappable. */}
        <div className="text-muted-foreground mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 pt-6 pb-24 text-xs sm:pb-6">
          <div>{year}</div>
          <div className="flex items-center gap-4">
            <Link
              href="/how-to-use"
              className="hover:text-foreground focus-visible:ring-ring/50 rounded-sm focus-visible:ring-2 focus-visible:outline-none"
            >
              How to use
            </Link>
            <Link
              href="/"
              className="hover:text-foreground focus-visible:ring-ring/50 rounded-sm focus-visible:ring-2 focus-visible:outline-none"
            >
              ibLedger
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
