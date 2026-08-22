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

// Clerk can swap sessions without a full page load, so AppShell reports the
// user id here and a change invalidates the cache below.
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

// POSTs /api/bootstrap once per app load and replays the result for later page
// mounts. Responses that demand a redirect are not cached.
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

  // The generation moved, so this payload belongs to the previous user.
  // Re-enter and fetch for the current one.
  const joinedGeneration = generation;
  return inFlight.then((boot) =>
    joinedGeneration === generation ? boot : checkBootstrap(),
  );
}

// Returns null when a redirect was issued and the caller should stop loading,
// otherwise the bootstrap payload.
export async function checkBootstrapOrRedirect(
  router: { replace: (href: string) => void },
  opts?: { skipOnboarding?: boolean },
): Promise<BootstrapResponse | null> {
  const boot = await checkBootstrap();

  // skipOnboarding lets the onboarding page be revisited once setup is done.
  if (!opts?.skipOnboarding && boot.onboarding?.required) {
    // Bouncing off the overview is just the start of setup; anywhere else the
    // user clicked a link, so say why.
    const path = typeof window === "undefined" ? "" : window.location.pathname;
    if (path !== "/" && path !== "/tracker") {
      // Fixed id so the notice can't stack: every gated page calls this, and
      // Strict Mode runs their mount effects twice in development.
      toast.info("Finish setting up your ledger before opening this page.", {
        id: "onboarding-required-redirect",
      });
    }

    router.replace(boot.onboarding.redirectTo);
    return null;
  }

  return boot;
}
