import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { RDKitModule } from "@rdkit/rdkit";

interface RdkitContextValue {
  rdkit: RDKitModule | null;
  ready: boolean;
}

const RdkitContext = createContext<RdkitContextValue>({ rdkit: null, ready: false });

export function useRdkit() {
  return useContext(RdkitContext);
}

export function RdkitProvider({ children }: { children: ReactNode }) {
  const [rdkit, setRdkit] = useState<RDKitModule | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // @rdkit/rdkit exports initRDKitModule as its main CJS export
    import("@rdkit/rdkit")
      .then((mod) => {
        // Handle both CJS (mod as callable) and ESM (mod.default) patterns
        const init = typeof mod === "function" ? mod : (mod as Record<string, unknown>).default ?? mod;
        return (init as (...args: unknown[]) => Promise<RDKitModule>)();
      })
      .then((instance) => {
        if (!cancelled) {
          setRdkit(instance);
          setReady(true);
        }
      })
      .catch((err) => {
        console.error("Failed to load RDKit WASM:", err);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <RdkitContext.Provider value={{ rdkit, ready }}>
      {children}
    </RdkitContext.Provider>
  );
}
