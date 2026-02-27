import { useMemo, useRef, useCallback } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  CheckCircle2,
  Loader2,
  Clock,
  XCircle,
  AlertTriangle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { useState } from "react";
import { useAppStore, type Compound, type CompoundStatus } from "@/stores/useAppStore";
import { cn } from "@/lib/utils";

const statusConfig: Record<
  CompoundStatus,
  { icon: React.ReactNode; color: string; label: string }
> = {
  COMPLETED: {
    icon: <CheckCircle2 className="h-4 w-4" />,
    color: "text-emerald-500",
    label: "Completed",
  },
  RUNNING: {
    icon: <Loader2 className="h-4 w-4 animate-spin" />,
    color: "text-blue-400",
    label: "Running",
  },
  CREATED: {
    icon: <Loader2 className="h-4 w-4 animate-spin" />,
    color: "text-blue-300",
    label: "Created",
  },
  PENDING: {
    icon: <Clock className="h-4 w-4" />,
    color: "text-zinc-500",
    label: "Pending",
  },
  FAILED: {
    icon: <XCircle className="h-4 w-4" />,
    color: "text-red-400",
    label: "Failed",
  },
  TIMED_OUT: {
    icon: <AlertTriangle className="h-4 w-4" />,
    color: "text-amber-400",
    label: "Timed Out",
  },
  CANCELLED: {
    icon: <XCircle className="h-4 w-4" />,
    color: "text-zinc-500",
    label: "Cancelled",
  },
};

function MetricCell({ value }: { value: number | undefined | null }) {
  if (value == null) return <span className="text-zinc-600">--</span>;
  return <span className="tabular-nums">{value.toFixed(3)}</span>;
}

const columnHelper = createColumnHelper<Compound>();

const columns = [
  columnHelper.accessor("status", {
    header: "",
    size: 40,
    enableSorting: false,
    cell: (info) => {
      const cfg = statusConfig[info.getValue()];
      return (
        <span className={cfg.color} title={cfg.label}>
          {cfg.icon}
        </span>
      );
    },
  }),
  columnHelper.accessor("display_name", {
    header: "Name",
    size: 160,
    cell: (info) => (
      <span className="truncate font-medium">{info.getValue()}</span>
    ),
  }),
  columnHelper.accessor("smiles", {
    header: "SMILES",
    size: 180,
    enableSorting: false,
    cell: (info) => (
      <span className="truncate font-mono text-xs text-zinc-500" title={info.getValue()}>
        {info.getValue()}
      </span>
    ),
  }),
  columnHelper.accessor((row) => row.metrics?.affinity.binding_confidence, {
    id: "binding_confidence",
    header: "Binding Conf.",
    size: 110,
    cell: (info) => <MetricCell value={info.getValue()} />,
  }),
  columnHelper.accessor((row) => row.metrics?.affinity.optimization_score, {
    id: "optimization_score",
    header: "Opt. Score",
    size: 100,
    cell: (info) => <MetricCell value={info.getValue()} />,
  }),
  columnHelper.accessor((row) => row.metrics?.samples[0]?.structure_confidence, {
    id: "structure_confidence",
    header: "Struct. Conf.",
    size: 110,
    cell: (info) => <MetricCell value={info.getValue()} />,
  }),
  columnHelper.accessor((row) => row.metrics?.samples[0]?.ligand_iptm, {
    id: "ligand_iptm",
    header: "Lig. ipTM",
    size: 90,
    cell: (info) => <MetricCell value={info.getValue()} />,
  }),
  columnHelper.accessor((row) => row.metrics?.samples[0]?.complex_plddt, {
    id: "complex_plddt",
    header: "pLDDT",
    size: 80,
    cell: (info) => <MetricCell value={info.getValue()} />,
  }),
];

export function ResultsTable() {
  const campaigns = useAppStore((s) => s.campaigns);
  const selectedCampaignId = useAppStore((s) => s.selectedCampaignId);
  const selectedRunId = useAppStore((s) => s.selectedRunId);
  const selectedCompoundId = useAppStore((s) => s.selectedCompoundId);
  const selectCompound = useAppStore((s) => s.selectCompound);

  const run = useMemo(() => {
    const campaign = campaigns.find((c) => c.id === selectedCampaignId);
    return campaign?.runs.find((r) => r.id === selectedRunId);
  }, [campaigns, selectedCampaignId, selectedRunId]);

  const [sorting, setSorting] = useState<SortingState>([]);

  const data = useMemo(() => run?.compounds ?? [], [run]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const { rows } = table.getRowModel();

  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 40,
    overscan: 10,
  });

  const handleRowClick = useCallback(
    (compoundId: string) => {
      selectCompound(
        compoundId === selectedCompoundId ? null : compoundId
      );
    },
    [selectCompound, selectedCompoundId]
  );

  if (!run) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-500">
        Select a run to view results
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Run header */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div>
          <h2 className="text-lg font-semibold">{run.display_name}</h2>
          <p className="text-xs text-zinc-500">
            {run.compounds.length} compounds
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="min-h-0 flex-1">
        {/* Header */}
        <div className="border-b border-zinc-800">
          {table.getHeaderGroups().map((headerGroup) => (
            <div key={headerGroup.id} className="flex">
              {headerGroup.headers.map((header) => (
                <div
                  key={header.id}
                  className={cn(
                    "flex shrink-0 items-center gap-1 px-3 py-2 text-xs font-medium text-zinc-500",
                    header.column.getCanSort() && "cursor-pointer select-none hover:text-zinc-300"
                  )}
                  style={{ width: header.getSize() }}
                  onClick={header.column.getToggleSortingHandler()}
                >
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext()
                  )}
                  {header.column.getCanSort() && (
                    <>
                      {header.column.getIsSorted() === "asc" ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : header.column.getIsSorted() === "desc" ? (
                        <ArrowDown className="h-3 w-3" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-30" />
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Virtualized rows */}
        <div ref={parentRef} className="h-full overflow-auto">
          <div
            style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index];
              const isSelected = row.original.id === selectedCompoundId;

              return (
                <div
                  key={row.id}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  className={cn(
                    "absolute left-0 flex w-full cursor-pointer items-center border-b border-zinc-800/50 transition-colors hover:bg-zinc-800/50",
                    isSelected && "bg-zinc-800"
                  )}
                  style={{
                    height: "40px",
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  onClick={() => handleRowClick(row.original.id)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <div
                      key={cell.id}
                      className="flex shrink-0 items-center overflow-hidden px-3 text-sm"
                      style={{ width: cell.column.getSize() }}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
