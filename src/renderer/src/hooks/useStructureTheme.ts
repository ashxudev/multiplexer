import { useSyncExternalStore } from "react";
import { useTheme } from "./useTheme";

export type StructureTheme = "light" | "dark" | "system";
type ResolvedStructureTheme = "light" | "dark";

const STORAGE_KEY = "multiplexer-structure-theme";

function getStored(): StructureTheme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return "system";
}

// ── External store ────────────────────────────────────────
let current = getStored();
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): StructureTheme {
  return current;
}

function notify() {
  listeners.forEach((l) => l());
}

export function setStructureTheme(theme: StructureTheme) {
  current = theme;
  if (theme === "system") {
    localStorage.removeItem(STORAGE_KEY);
  } else {
    localStorage.setItem(STORAGE_KEY, theme);
  }
  notify();
}

// ── Hook ──────────────────────────────────────────────────
export function useStructureTheme() {
  const structureTheme = useSyncExternalStore(subscribe, getSnapshot);
  const { resolved: appResolved } = useTheme();

  const resolved: ResolvedStructureTheme =
    structureTheme === "system" ? appResolved : structureTheme;

  return { structureTheme, resolved, setStructureTheme } as const;
}
