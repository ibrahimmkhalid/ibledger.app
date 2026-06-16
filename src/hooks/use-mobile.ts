"use client";

import { useSyncExternalStore } from "react";

const DEFAULT_BREAKPOINT_PX = 768;

function subscribeToViewportChange(onStoreChange: () => void) {
  window.addEventListener("resize", onStoreChange);
  return () => window.removeEventListener("resize", onStoreChange);
}

function getServerSnapshot() {
  return false;
}

export function useIsMobile(breakpointPx: number = DEFAULT_BREAKPOINT_PX) {
  return useSyncExternalStore(
    subscribeToViewportChange,
    () => window.innerWidth < breakpointPx,
    getServerSnapshot,
  );
}
