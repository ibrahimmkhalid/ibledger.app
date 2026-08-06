import { toast } from "sonner";

import { apiJson } from "@/app/tracker/lib/api";
import type { BootstrapResponse } from "@/app/tracker/types";

// AppShell hides the nav while setup is unfinished, but it never calls the
// bootstrap endpoint itself. The pages that do publish the answer here.
type Listener = () => void;
const onboardingListeners = new Set<Listener>();
let onboardingRequired = false;

function setOnboardingRequired(next: boolean) {
  if (onboardingRequired === next) return;
  onboardingRequired = next;
  for (const listener of onboardingListeners) listener();
}

export function subscribeOnboardingRequired(listener: Listener) {
  onboardingListeners.add(listener);
  return () => {
    onboardingListeners.delete(listener);
  };
}

export function getOnboardingRequired() {
  return onboardingRequired;
}

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
  setOnboardingRequired(false);
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
        if (requestGeneration === generation) {
          setOnboardingRequired(Boolean(boot.onboarding?.required));
          if (!boot.onboarding?.required) settled = boot;
        }
        return boot;
      })
      .finally(() => {
        if (requestGeneration === generation) {
          inFlight = null;
        }
      });
  }

  // A session swap while the request is in flight bumps the generation; the
  // resolved payload then belongs to the previous user and must not drive
  // caching or onboarding redirects, so re-enter to fetch for the current
  // identity instead of handing the stale response to the caller.
  const joinedGeneration = generation;
  return inFlight.then((boot) =>
    joinedGeneration === generation ? boot : checkBootstrap(),
  );
}

// Returns null when a redirect was issued and the caller should stop loading,
// otherwise the bootstrap payload. Every tracker page opens with this; most
// only need the null check, but onboarding reads onboarding.required off the
// payload to tell a first run from a revisit.
export async function checkBootstrapOrRedirect(
  router: { replace: (href: string) => void },
  opts?: { skipOnboarding?: boolean },
): Promise<BootstrapResponse | null> {
  const boot = await checkBootstrap();

  // The onboarding page passes skipOnboarding so users can revisit it to tweak
  // their initial setup after it is no longer required.
  if (!opts?.skipOnboarding && boot.onboarding?.required) {
    // The overview is where a new user lands, so bouncing from there is simply
    // the start of setup. Anywhere else they clicked a link and the page
    // flashed back to onboarding, which reads as broken unless we say why.
    const path = typeof window === "undefined" ? "" : window.location.pathname;
    if (path !== "/" && path !== "/tracker") {
      toast.info("Finish setting up your ledger before opening this page.");
    }

    router.replace(boot.onboarding.redirectTo);
    return null;
  }

  return boot;
}
