import { useMemo } from "react";
import { useRdkit } from "@/components/shared/RdkitProvider";
import { useStructureTheme } from "@/hooks/useStructureTheme";

interface MoleculeImageProps {
  smiles: string;
  className?: string;
  width?: number;
  height?: number;
}

export function MoleculeImage({
  smiles,
  className,
  width = 300,
  height = 200,
}: MoleculeImageProps) {
  const { rdkit, ready } = useRdkit();
  const { resolved: structureMode } = useStructureTheme();

  const svg = useMemo(() => {
    if (!rdkit || !ready) return null;
    try {
      const mol = rdkit.get_mol(smiles);
      if (!mol) return null;
      try {
        return mol.get_svg(width, height);
      } finally {
        mol.delete();
      }
    } catch {
      return null;
    }
  }, [rdkit, ready, smiles, width, height]);

  if (!ready || !svg) {
    return (
      <div
        className={`flex items-center justify-center rounded-md border border-border bg-surface p-2 font-mono text-xs text-subtle ${className ?? ""}`}
        title={smiles}
      >
        <span className="max-w-full truncate">{smiles}</span>
      </div>
    );
  }

  return (
    <img
      src={`data:image/svg+xml;base64,${btoa(svg)}`}
      alt={smiles}
      title={smiles}
      className={`rounded-md ${structureMode === "dark" ? "invert hue-rotate-180" : ""} ${className ?? ""}`}
    />
  );
}
