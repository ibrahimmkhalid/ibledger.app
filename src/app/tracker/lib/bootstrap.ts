import { apiJson } from "@/app/tracker/lib/api";
import type { BootstrapResponse } from "@/app/tracker/types";

let settled: BootstrapResponse | null = null;
let inFlight: Promise<BootstrapResponse> | null = null;

// POSTs /api/bootstrap once per app load and replays the result for later
// page mounts, removing a serial round trip from every tracker navigation.
// Responses that demand a redirect (migration or onboarding required) are
// not cached, so those flows keep re-checking until they complete.
export function checkBootstrap(): Promise<BootstrapResponse> {
  if (settled) return Promise.resolve(settled);

  if (!inFlight) {
    inFlight = apiJson<BootstrapResponse>("/api/bootstrap", {
      method: "POST",
      body: "{}",
    })
      .then((boot) => {
        if (!boot.migration?.required && !boot.onboarding?.required) {
          settled = boot;
        }
        return boot;
      })
      .finally(() => {
        inFlight = null;
      });
  }

  return inFlight;
}
