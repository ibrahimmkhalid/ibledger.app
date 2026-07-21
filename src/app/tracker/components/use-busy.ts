import { useState } from "react";

// The busy/error state both event modals share, plus the wrapper that runs an
// async action with them: clear the error, flip busy on, and on failure surface
// the message (falling back to `fallback`) rather than throwing.
export function useBusy() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runWithBusy(op: () => Promise<void>, fallback: string) {
    setError(null);
    setBusy(true);
    try {
      await op();
    } catch (e) {
      setError(e instanceof Error ? e.message : fallback);
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, setBusy, setError, runWithBusy };
}
