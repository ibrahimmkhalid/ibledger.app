"use client";

import { useEffect, useState } from "react";

const DEFAULT_BREAKPOINT_PX = 768;

export function useIsMobile(breakpointPx: number = DEFAULT_BREAKPOINT_PX) {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.innerWidth < breakpointPx;
  });

  useEffect(() => {
    function onResize() {
      setIsMobile(window.innerWidth < breakpointPx);
    }

    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [breakpointPx]);

  return isMobile;
}
