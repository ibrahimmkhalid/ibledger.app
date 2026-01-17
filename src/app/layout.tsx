import { type Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/utils/auth-provider";
import { ThemeProvider } from "@/components/utils/theme-provider";

export const metadata: Metadata = {
  title: "Ibrahim's Ledger App",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const currentYear = new Date().getFullYear();
  const isDevTesting = process.env.DEV_TESTING === "true";

  return (
    <AuthProvider devTesting={isDevTesting}>
      <html lang="en" suppressHydrationWarning>
        <body>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <div>
              <header></header>
              <div>
                <main>{children}</main>
              </div>
              <footer>{currentYear}</footer>
            </div>
          </ThemeProvider>
        </body>
      </html>
    </AuthProvider>
  );
}
