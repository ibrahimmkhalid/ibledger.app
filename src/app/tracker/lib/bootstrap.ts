import { apiJson } from "@/app/tracker/lib/api";
import type { BootstrapResponse } from "@/app/tracker/types";

let settled: BootstrapResponse | null = null;
let inFlight: Promise<BootstrapResponse> | null = null;
// undefined = no identity reported yet this app load.
let identity: string | null | undefined;
let generation = 0;

// The cache below assumes one signed-in user per JS context, but Clerk can
// swap sessions without a full page load (sign-out via client navigation,
// multi-session account switching). AppShell reports the Clerk user id here;
// when it changes, the previous user's cached bootstrap must not be replayed.
export function syncBootstrapIdentity(userId: string | null) {
  if (identity === userId) return;
  const isFirstReport = identity === undefined;
  identity = userId;
  // The first report races page mounts that may have warmed the cache for
  // this same user; only an actual change invalidates.
  if (isFirstReport) return;
  generation += 1;
  settled = null;
  inFlight = null;
}

// POSTs /api/bootstrap once per app load and replays the result for later
// page mounts, removing a serial round trip from every tracker navigation.
// Responses that demand a redirect (onboarding required) are not cached, so
// that flow keeps re-checking until it completes.
function checkBootstrap(): Promise<BootstrapResponse> {
  if (settled) return Promise.resolve(settled);

  if (!inFlight) {
    const requestGeneration = generation;
    inFlight = apiJson<BootstrapResponse>("/api/bootstrap", {
      method: "POST",
      body: "{}",
    })
      .then((boot) => {
        if (requestGeneration === generation && !boot.onboarding?.required) {
          settled = boot;
        }
        return boot;
      })
      .finally(() => {
        if (requestGeneration === generation) {
          inFlight = null;
        }
      });
  }

  return inFlight;
}

// Returns false when a redirect was issued and the caller should stop loading.
// Every tracker page opens with this.
export async function checkBootstrapOrRedirect(
  router: { replace: (href: string) => void },
  opts?: { skipOnboarding?: boolean },
) {
  const boot = await checkBootstrap();

  // The onboarding page passes skipOnboarding so users can revisit it to tweak
  // their initial setup after it is no longer required.
  if (!opts?.skipOnboarding && boot.onboarding?.required) {
    router.replace(boot.onboarding.redirectTo);
    return false;
  }

  return true;
}
