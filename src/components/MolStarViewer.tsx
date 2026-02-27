import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import * as api from "@/lib/tauri-api";

interface MolStarViewerProps {
  compoundId: string;
  sampleIndex: number;
}

export function MolStarViewer({ compoundId, sampleIndex }: MolStarViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    setLoading(true);
    setError(null);

    // Track the plugin so we can dispose on cleanup
    let pluginRef: { dispose(): void } | null = null;

    async function init() {
      try {
        const cifContent = await api.getPoseCif(compoundId, sampleIndex);
        if (cancelled) return;

        const { PluginContext } = await import("molstar/lib/mol-plugin/context");
        const { DefaultPluginSpec } = await import("molstar/lib/mol-plugin/spec");
        if (cancelled) return;

        const plugin = new PluginContext(DefaultPluginSpec());
        pluginRef = plugin;
        await plugin.init();
        if (cancelled) { plugin.dispose(); return; }

        // Create and mount canvas
        const canvas = document.createElement("canvas");
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        container!.appendChild(canvas);
        await plugin.initViewerAsync(canvas, container!);
        if (cancelled) { plugin.dispose(); return; }

        // Load CIF data
        const data = await plugin.builders.data.rawData({
          data: cifContent,
          label: "structure",
        });
        const trajectory = await plugin.builders.structure.parseTrajectory(
          data,
          "mmcif"
        );
        await plugin.builders.structure.hierarchy.applyPreset(
          trajectory,
          "default"
        );

        if (cancelled) { plugin.dispose(); return; }
        setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      pluginRef?.dispose();
      if (container) container.innerHTML = "";
    };
  }, [compoundId, sampleIndex]);

  if (error) {
    return (
      <div className="flex h-48 items-center justify-center rounded-md border border-dashed border-zinc-800 bg-zinc-900/50">
        <span className="text-xs text-red-400">{error}</span>
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="h-48 rounded-md border border-zinc-800 bg-zinc-900"
      />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center rounded-md bg-zinc-900/80">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
        </div>
      )}
    </div>
  );
}
