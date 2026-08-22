"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

const ORDER = ["light", "dark", "system"] as const;

/** Cycles light → dark → system. Renders a stable placeholder until mounted so
 *  the server and first client render match (next-themes resolves post-mount). */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Mount gate: next-themes only resolves the theme on the client.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  const current = ORDER.find((choice) => choice === theme) ?? "system";
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
  const Icon =
    current === "dark" ? MoonIcon : current === "light" ? SunIcon : MonitorIcon;

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`Theme: ${current}. Switch to ${next}.`}
      title={`Theme: ${current}`}
      onClick={() => setTheme(next)}
    >
      {mounted ? <Icon /> : <span className="size-4" />}
    </Button>
  );
}
