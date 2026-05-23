"use client";

import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";

type ThemeMode = "light" | "dark";

const STORAGE_KEY = "acutize:theme";

export function ThemeToggle() {
  // Render deterministically on first paint to avoid hydration mismatch.
  const [mode, setMode] = useState<ThemeMode>("light");

  useLayoutEffect(() => {
    document.documentElement.classList.toggle("dark", mode === "dark");
  }, [mode]);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const initial: ThemeMode = stored === "dark" || stored === "light" ? stored : prefersDark ? "dark" : "light";
    queueMicrotask(() => {
      setMode(initial);
    });

    const onStorage = () => {
      const nextStored = window.localStorage.getItem(STORAGE_KEY);
      if (nextStored === "dark" || nextStored === "light") setMode(nextStored);
    };

    // Only follow system changes when user hasn't explicitly selected a theme yet.
    const shouldFollowSystem = stored !== "dark" && stored !== "light";
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onMediaChange = () => {
      if (!shouldFollowSystem) return;
      setMode(media.matches ? "dark" : "light");
    };

    window.addEventListener("storage", onStorage);
    media.addEventListener("change", onMediaChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      media.removeEventListener("change", onMediaChange);
    };
  }, []);

  const icon = useMemo(() => (mode === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />), [mode]);

  return (
    <Button
      type="button"
      variant="ghost"
      className="h-9 w-9 p-0"
      onClick={() => {
        const next: ThemeMode = mode === "dark" ? "light" : "dark";
        window.localStorage.setItem(STORAGE_KEY, next);
        setMode(next);
      }}
      aria-label={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      {icon}
    </Button>
  );
}
