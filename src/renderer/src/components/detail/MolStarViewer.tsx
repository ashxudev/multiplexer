import { useEffect, useRef, useState } from 'react';
import { Color } from 'molstar/lib/mol-util/color';
import { PLDDTConfidenceColorThemeProvider } from 'molstar/lib/extensions/model-archive/quality-assessment/color/plddt';
import { trpc } from '@/api/trpc';
import { useStructureTheme } from '@/hooks/useStructureTheme';

interface MolStarViewerProps {
  compoundId: string;
  sampleIndex: number;
  className?: string;
}

const BG_DARK = Color(0x000000);
const BG_LIGHT = Color(0xFFFFFF);

export function MolStarViewer({ compoundId, sampleIndex, className }: MolStarViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pluginRef = useRef<{ canvas3d?: { setProps(p: unknown): void } | null; dispose(): void } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { resolved: structureMode } = useStructureTheme();

  const cifQuery = trpc.compounds.getPoseCif.useQuery(
    { compoundId, sampleIndex },
    { enabled: !!compoundId },
  );

  // ── Initialize Mol* and load structure ──────────────────
  useEffect(() => {
    if (!cifQuery.data) return;

    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;


    setError(null);

    async function init() {
      try {
        const { PluginContext } = await import('molstar/lib/mol-plugin/context');
        const { DefaultPluginSpec } = await import('molstar/lib/mol-plugin/spec');
        if (cancelled) return;

        const plugin = new PluginContext(DefaultPluginSpec());
        pluginRef.current = plugin;
        await plugin.init();
        if (cancelled) { plugin.dispose(); return; }

        const canvas = document.createElement('canvas');
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        container!.appendChild(canvas);
        await plugin.initViewerAsync(canvas, container!);
        if (cancelled) { plugin.dispose(); return; }

        plugin.canvas3d?.setProps({
          renderer: { backgroundColor: structureMode === 'dark' ? BG_DARK : BG_LIGHT },
        });

        // Register the pLDDT confidence color theme (from Mol*'s model-archive extension)
        plugin.representation.structure.themes.colorThemeRegistry.add(PLDDTConfidenceColorThemeProvider);

        const data = await plugin.builders.data.rawData({
          data: cifQuery.data,
          label: 'structure',
        });
        const trajectory = await plugin.builders.structure.parseTrajectory(data, 'mmcif');
        await plugin.builders.structure.hierarchy.applyPreset(trajectory, 'default');

        // Apply pLDDT confidence coloring (discrete AlphaFold palette)
        if (!cancelled) {
          const structures = plugin.managers.structure.hierarchy.current.structures;
          for (const s of structures) {
            await plugin.managers.structure.component.updateRepresentationsTheme(
              s.components,
              { color: PLDDTConfidenceColorThemeProvider.name as any } as any,
            );
          }
        }

        if (cancelled) { plugin.dispose(); return; }

      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
  
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      pluginRef.current?.dispose();
      pluginRef.current = null;
      if (container) container.innerHTML = '';
    };
  }, [cifQuery.data]);

  // ── Update background color when structure theme changes ─
  useEffect(() => {
    pluginRef.current?.canvas3d?.setProps({
      renderer: { backgroundColor: structureMode === 'dark' ? BG_DARK : BG_LIGHT },
    });
  }, [structureMode]);

  if (cifQuery.isError) {
    return (
      <div className="flex items-center justify-center rounded-md border border-dashed border-border bg-surface/50">
        <span className="text-xs text-red-400">Failed to load structure</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center rounded-md border border-dashed border-border bg-surface/50">
        <span className="text-xs text-red-400">{error}</span>
      </div>
    );
  }

  return (
    <div className={`relative ${className ?? 'h-48'}`}>
      <div
        ref={containerRef}
        className={`h-full overflow-hidden rounded-md border border-border ${structureMode === 'dark' ? 'bg-black' : 'bg-white'}`}
      />
    </div>
  );
}
