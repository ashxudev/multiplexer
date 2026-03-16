import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ParsedCompound } from "@/types/compounds";

interface CsvPreviewTableProps {
  compounds: ParsedCompound[];
  errors?: string[];
  invalidIndices?: Set<number>;
}

export function CsvPreviewTable({ compounds, errors, invalidIndices }: CsvPreviewTableProps) {
  return (
    <div className="space-y-2">
      {errors && errors.length > 0 && (
        <div className="rounded-md border bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/50 p-2">
          {errors.map((err, i) => (
            <p key={i} className="text-xs text-amber-600 dark:text-amber-400">{err}</p>
          ))}
        </div>
      )}
      <div className="max-h-48 overflow-auto rounded-md border border-border">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-surface">
            <tr>
              <th className="px-3 py-1.5 text-left font-medium text-subtle">#</th>
              <th className="px-3 py-1.5 text-left font-medium text-subtle">Name</th>
              <th className="px-3 py-1.5 text-left font-medium text-subtle">SMILES</th>
            </tr>
          </thead>
          <tbody>
            {compounds.map((c, i) => (
              <tr
                key={i}
                className={cn(
                  "border-t border-border/50",
                  invalidIndices?.has(i)
                    ? "bg-red-50 dark:bg-red-950/30"
                    : i % 2 === 0
                      ? "bg-background"
                      : "bg-surface/30"
                )}
              >
                <td className="px-3 py-1 tabular-nums text-faint">{i + 1}</td>
                <td className="px-3 py-1 text-dim">{c.name}</td>
                <td
                  className={cn(
                    "max-w-[200px] truncate px-3 py-1 font-mono text-subtle",
                    invalidIndices?.has(i) && "text-red-600 dark:text-red-400"
                  )}
                  title={c.smiles}
                >
                  <span className="flex items-center gap-1">
                    {invalidIndices?.has(i) && (
                      <AlertTriangle className="h-3 w-3 shrink-0 text-red-600 dark:text-red-400" />
                    )}
                    <span className="truncate">{c.smiles}</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
