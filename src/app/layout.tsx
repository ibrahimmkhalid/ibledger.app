import { type Metadata } from "next";
import {
  ClerkProvider,
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
} from "@clerk/nextjs";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { DarkModeToggle } from "@/components/DarkModeToggle";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ibrahim's Ledger App",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const currentYear = new Date().getFullYear();
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <body
          className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        >
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <div className="flex min-h-screen flex-col">
              <header className="bg-background/80 sticky top-0 z-50 border-b backdrop-blur-sm">
                <div className="container mx-auto flex items-center justify-between px-4 py-4">
                  <Link
                    href="/"
                    className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-2xl font-bold text-transparent transition-colors hover:from-blue-700 hover:to-indigo-700"
                  >
                    Ibrahim&apos;s Ledger App
                  </Link>
                  <div className="flex items-center gap-4">
                    <SignedOut>
                      <Button asChild>
                        <SignInButton />
                      </Button>
                      <Button asChild>
                        <SignUpButton />
                      </Button>
                    </SignedOut>
                    <SignedIn>
                      <UserButton />
                    </SignedIn>
                    <DarkModeToggle />
                  </div>
                </div>
              </header>

              <div className="flex flex-1 justify-center">
                <main className="mx-auto mt-12 w-10/12 lg:w-1/2">
                  {children}
                </main>
              </div>

              <footer className="border-t border-gray-200 bg-gray-100 py-6 text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
                <div className="container mx-auto flex flex-col items-center justify-between px-4 text-sm sm:flex-row">
                  <div className="mb-4 flex flex-col items-center sm:mb-0 sm:flex-row sm:gap-6">
                    <span className="font-semibold text-gray-800 dark:text-gray-200">
                      Ibrahim&apos;s Ledger App
                    </span>
                    <span className="hidden sm:inline">|</span>
                    <a
                      className="hover:underline"
                      href="https://ibrahimkhalid.me"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Website
                    </a>
                    <span className="hidden sm:inline">|</span>
                    <a
                      className="hover:underline"
                      href="https://github.com/ibrahimmkhalid"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      GitHub
                    </a>
                    <span className="hidden sm:inline">|</span>
                    <a
                      className="hover:underline"
                      href="https://linkedin.com/in/ibrahimmkhalid"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      LinkedIn
                    </a>
                  </div>
                  <div>&copy; {currentYear}</div>
                </div>
              </footer>
            </div>
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
