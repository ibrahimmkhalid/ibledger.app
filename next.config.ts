import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Funds and wallets are edited on one page now. Both old routes are
  // bookmarked, so they move rather than 404.
  async redirects() {
    return [
      {
        source: "/tracker/funds",
        destination: "/tracker/setup",
        permanent: true,
      },
      {
        source: "/tracker/wallets",
        destination: "/tracker/setup",
        permanent: true,
      },
    ];
  },
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "@radix-ui/react-dialog",
      "@radix-ui/react-popover",
      "@radix-ui/react-select",
      "@radix-ui/react-tooltip",
    ],
  },
};

export default nextConfig;
