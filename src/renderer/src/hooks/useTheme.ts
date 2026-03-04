import { useEffect, useSyncExternalStore } from "react";

export type Theme = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "multiplexer-theme";

function getStoredTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return "system";
}

function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme !== "system") return theme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyToDOM(resolved: ResolvedTheme) {
  const cl = document.documentElement.classList;
  cl.toggle("dark", resolved === "dark");
  cl.toggle("light", resolved === "light");
}

// ── External store ────────────────────────────────────────
let current = getStoredTheme();
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): Theme {
  return current;
}

function notify() {
  listeners.forEach((l) => l());
}

export function setTheme(theme: Theme) {
  current = theme;
  if (theme === "system") {
    localStorage.removeItem(STORAGE_KEY);
  } else {
    localStorage.setItem(STORAGE_KEY, theme);
  }
  applyToDOM(resolveTheme(theme));
  notify();
}

// ── Hook ──────────────────────────────────────────────────
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot);
  const resolved = resolveTheme(theme);

  useEffect(() => {
    applyToDOM(resolved);

    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    function onChange() {
      if (current === "system") {
        applyToDOM(resolveTheme("system"));
        notify();
      }
    }
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [resolved]);

  return { theme, resolved, setTheme } as const;
}
