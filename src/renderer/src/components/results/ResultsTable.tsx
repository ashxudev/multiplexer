import { useCallback, useEffect, useState, useMemo } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, Download } from 'lucide-react';
import Papa from 'papaparse';
import { trpc } from '@/api/trpc';
import { useAppStore } from '@/stores/useAppStore';
import { useRdkit } from '@/components/shared/RdkitProvider';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type SortColumn = 'status' | 'compound' | 'confidence' | 'complex_plddt' | 'iptm' | 'ptm' | 'binding_confidence' | 'optimization_score';

export function ResultsTable({
  runId,
  targetType = 'protein',
  campaignName = '',
  targetSequence = '',
}: {
  runId: string;
  targetType?: string;
  campaignName?: string;
  targetSequence?: string;
}) {
  const run = trpc.runs.get.useQuery({ runId });
  const selectCompound = useAppStore((s) => s.selectCompound);
  const selectedCompoundId = useAppStore((s) => s.selectedCompoundId);
  const { rdkit, ready: rdkitReady } = useRdkit();
  const exportCsv = trpc.actions.exportCsv.useMutation();

  const showAffinity = targetType === 'protein';

  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    if (!showAffinity && (sortColumn === 'binding_confidence' || sortColumn === 'optimization_score')) {
      setSortColumn(null);
    }
  }, [showAffinity, sortColumn]);

  const sortedCompounds = useMemo(() => {
    const compounds = run.data?.compounds ?? [];
    if (!sortColumn) return compounds;

    return [...compounds].sort((a, b) => {
      let aVal: string | number | null;
      let bVal: string | number | null;

      switch (sortColumn) {
        case 'status':
          aVal = a.status;
          bVal = b.status;
          break;
        case 'compound':
          aVal = a.display_name;
          bVal = b.display_name;
          break;
        case 'confidence':
          aVal = a.metrics?.samples[0]?.structure_confidence ?? null;
          bVal = b.metrics?.samples[0]?.structure_confidence ?? null;
          break;
        case 'complex_plddt':
          aVal = a.metrics?.samples[0]?.complex_plddt ?? null;
          bVal = b.metrics?.samples[0]?.complex_plddt ?? null;
          break;
        case 'iptm':
          aVal = a.metrics?.samples[0]?.iptm ?? null;
          bVal = b.metrics?.samples[0]?.iptm ?? null;
          break;
        case 'ptm':
          aVal = a.metrics?.samples[0]?.ptm ?? null;
          bVal = b.metrics?.samples[0]?.ptm ?? null;
          break;
        case 'binding_confidence':
          aVal = a.metrics?.affinity?.binding_confidence ?? null;
          bVal = b.metrics?.affinity?.binding_confidence ?? null;
          break;
        case 'optimization_score':
          aVal = a.metrics?.affinity?.optimization_score ?? null;
          bVal = b.metrics?.affinity?.optimization_score ?? null;
          break;
      }

      // Nulls always sort to bottom
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;

      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [run.data?.compounds, sortColumn, sortDir]);

  const handleSort = (col: SortColumn) => {
    if (sortColumn === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(col);
      setSortDir('desc');
    }
  };

  const handleExportCsv = useCallback(() => {
    if (!run.data) return;

    const runName = run.data.display_name;
    const params = run.data.params;

    // Metadata header rows (# prefixed)
    const seq = targetSequence.length > 50 ? targetSequence.slice(0, 50) + '...' : targetSequence;
    const metaLines = [
      `# Campaign: ${campaignName}`,
      `# Target Type: ${targetType}`,
      `# Target Sequence: ${seq}`,
      `# Run: ${runName}`,
      `# Parameters: recycling_steps=${params.recycling_steps}, diffusion_samples=${params.diffusion_samples}, sampling_steps=${params.sampling_steps}, step_scale=${params.step_scale}`,
      `# Exported: ${new Date().toISOString()}`,
      `# Model: Boltz-2`,
    ];

    // Column headers
    const headers = [
      'Rank', 'Name', 'SMILES', 'Status',
      'Structure Confidence', 'Complex pLDDT', 'ipTM', 'pTM',
    ];
    if (showAffinity) headers.push('Binding Confidence', 'Optimization Score');
    headers.push('MW', 'CLogP', 'TPSA', 'HBA', 'HBD', 'Rotatable Bonds');

    // Build rows using current sort order
    const rows = sortedCompounds.map((compound, index) => {
      const sample = compound.metrics?.samples[0] ?? null;
      const affinity = compound.metrics?.affinity ?? null;

      // RDKit: canonical SMILES + descriptors
      let canonSmiles = compound.smiles;
      let mw: number | null = null;
      let clogp: number | null = null;
      let tpsa: number | null = null;
      let hba: number | null = null;
      let hbd: number | null = null;
      let rotBonds: number | null = null;

      if (rdkit && rdkitReady) {
        try {
          const mol = rdkit.get_mol(compound.smiles);
          if (mol) {
            try {
              canonSmiles = mol.get_smiles();
              const desc = JSON.parse(mol.get_descriptors());
              mw = desc.exactmw ?? null;
              clogp = desc.CrippenClogP ?? null;
              tpsa = desc.tpsa ?? null;
              hba = desc.NumHBA ?? null;
              hbd = desc.NumHBD ?? null;
              rotBonds = desc.NumRotatableBonds ?? null;
            } finally {
              mol.delete();
            }
          }
        } catch {
          // RDKit failure — leave descriptor cells empty
        }
      }

      const row: (string | number | null)[] = [
        index + 1,
        compound.display_name,
        canonSmiles,
        compound.status,
        sample?.structure_confidence ?? null,
        sample?.complex_plddt ?? null,
        sample?.iptm ?? null,
        sample?.ptm ?? null,
      ];
      if (showAffinity) {
        row.push(affinity?.binding_confidence ?? null, affinity?.optimization_score ?? null);
      }
      row.push(mw, clogp, tpsa, hba, hbd, rotBonds);
      return row;
    });

    const csvData = Papa.unparse({ fields: headers, data: rows });
    const fullCsv = metaLines.join('\n') + '\n' + csvData;

    // Sanitized default filename
    const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, 50);
    const dateStr = new Date().toISOString().slice(0, 10);
    const defaultFilename = `${sanitize(campaignName)}_${sanitize(runName)}_${dateStr}.csv`;

    exportCsv.mutate({ csvContent: fullCsv, defaultFilename });
  }, [run.data, sortedCompounds, showAffinity, rdkit, rdkitReady, campaignName, targetType, targetSequence, exportCsv]);

  if (run.isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (!run.data) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Run not found
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-end border-b border-border px-4 py-1.5">
        <Button
          variant="ghost"
          size="xs"
          onClick={handleExportCsv}
          disabled={exportCsv.isPending || !run.data?.compounds.length}
        >
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </Button>
      </div>
      <div className="flex-1 overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-background border-b border-border">
          <tr>
            <SortHeader column="status" label="Status" align="left" activeColumn={sortColumn} sortDir={sortDir} onSort={handleSort} />
            <SortHeader column="compound" label="Compound" align="left" activeColumn={sortColumn} sortDir={sortDir} onSort={handleSort} />
            <th className="px-4 py-2 text-left font-medium text-muted-foreground">SMILES</th>
            {showAffinity && (
              <>
                <SortHeader column="binding_confidence" label={<span className="text-left">Binding<br/>Confidence</span>} align="center" activeColumn={sortColumn} sortDir={sortDir} onSort={handleSort} />
                <SortHeader column="optimization_score" label={<span className="text-left">Optimization<br/>Score</span>} align="center" activeColumn={sortColumn} sortDir={sortDir} onSort={handleSort} />
              </>
            )}
            <SortHeader column="confidence" label={<span className="text-left">Structure<br/>Confidence</span>} align="center" activeColumn={sortColumn} sortDir={sortDir} onSort={handleSort} />
            <SortHeader column="complex_plddt" label="pLDDT" align="center" activeColumn={sortColumn} sortDir={sortDir} onSort={handleSort} />
            <SortHeader column="iptm" label="ipTM" align="center" activeColumn={sortColumn} sortDir={sortDir} onSort={handleSort} />
            <SortHeader column="ptm" label="pTM" align="center" activeColumn={sortColumn} sortDir={sortDir} onSort={handleSort} />
          </tr>
        </thead>
        <tbody>
          {sortedCompounds.map((compound) => {
            const confidence = compound.metrics?.samples[0]?.structure_confidence ?? null;
            const complexPlddt = compound.metrics?.samples[0]?.complex_plddt ?? null;
            const iptm = compound.metrics?.samples[0]?.iptm ?? null;
            const ptm = compound.metrics?.samples[0]?.ptm ?? null;
            const bindingConf = compound.metrics?.affinity?.binding_confidence ?? null;
            const optScore = compound.metrics?.affinity?.optimization_score ?? null;

            return (
              <tr
                key={compound.id}
                onClick={() => selectCompound(compound.id)}
                className={cn(
                  "border-b border-border/50 cursor-pointer hover:bg-muted/50 transition-colors",
                  selectedCompoundId === compound.id && "bg-muted/50"
                )}
              >
                <td className="px-4 py-2">
                  <StatusBadge status={compound.status} />
                </td>
                <td className="px-4 py-2">{compound.display_name}</td>
                <td className="px-4 py-2 max-w-[200px] truncate font-mono text-xs text-muted-foreground">
                  {compound.smiles}
                </td>
                {showAffinity && (
                  <>
                    <td className="px-4 py-2 text-center tabular-nums text-foreground">
                      {bindingConf != null ? bindingConf.toFixed(2) : '—'}
                    </td>
                    <td className="px-4 py-2 text-center tabular-nums text-foreground">
                      {optScore != null ? optScore.toFixed(2) : '—'}
                    </td>
                  </>
                )}
                <td className="px-4 py-2 text-center tabular-nums text-foreground">
                  {confidence != null ? confidence.toFixed(2) : '—'}
                </td>
                <td className="px-4 py-2 text-center tabular-nums text-foreground">
                  {complexPlddt != null ? complexPlddt.toFixed(2) : '—'}
                </td>
                <td className="px-4 py-2 text-center tabular-nums text-foreground">
                  {iptm != null ? iptm.toFixed(2) : '—'}
                </td>
                <td className="px-4 py-2 text-center tabular-nums text-foreground">
                  {ptm != null ? ptm.toFixed(2) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}

function SortHeader({
  column,
  label,
  align,
  activeColumn,
  sortDir,
  onSort,
}: {
  column: SortColumn;
  label: React.ReactNode;
  align: 'left' | 'right' | 'center';
  activeColumn: SortColumn | null;
  sortDir: 'asc' | 'desc';
  onSort: (col: SortColumn) => void;
}) {
  const isActive = activeColumn === column;
  const Icon = isActive ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;

  return (
    <th className={cn("px-4 py-2 font-medium text-muted-foreground", { 'text-right': align === 'right', 'text-left': align === 'left', 'text-center': align === 'center' })}>
      <button
        onClick={() => onSort(column)}
        className={cn("inline-flex items-center gap-1 hover:text-foreground transition-colors", align === 'center' && "mx-auto")}
      >
        {label}
        <Icon className={cn("h-3 w-3", !isActive && "opacity-40")} />
      </button>
    </th>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    COMPLETED: 'text-emerald-500',
    RUNNING: 'text-blue-400',
    CREATED: 'text-blue-400',
    PENDING: 'text-muted-foreground',
    FAILED: 'text-red-400',
    TIMED_OUT: 'text-amber-400',
    CANCELLED: 'text-muted-foreground',
  };

  return (
    <span className={`text-xs font-medium ${styles[status] ?? 'text-muted-foreground'}`}>
      {status}
    </span>
  );
}
