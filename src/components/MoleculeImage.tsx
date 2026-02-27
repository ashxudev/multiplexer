import { useMemo } from "react";
import { useRdkit } from "@/components/RdkitProvider";

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
        className={`flex items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 p-2 font-mono text-xs text-zinc-500 ${className ?? ""}`}
        title={smiles}
      >
        <span className="max-w-full truncate">{smiles}</span>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 ${className ?? ""}`}
      title={smiles}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
