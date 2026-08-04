import type { Metadata } from "next";

import { HowToUseGuide } from "@/app/how-to-use/guide";

export const metadata: Metadata = {
  title: "How to use ibLedger",
};

export default function HowToUsePage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:py-16">
      <h1 className="text-3xl font-semibold tracking-tight">
        How to use ibLedger
      </h1>
      <p className="text-muted-foreground mt-3 text-sm">
        Everything the app assumes you know, in one place.
      </p>

      <div className="mt-10">
        <HowToUseGuide />
      </div>
    </div>
  );
}
