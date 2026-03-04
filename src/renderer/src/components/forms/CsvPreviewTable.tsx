import { cn } from "@/lib/utils";

interface ParsedCompound {
  name: string;
  smiles: string;
}

interface CsvPreviewTableProps {
  compounds: ParsedCompound[];
  errors?: string[];
}

export function CsvPreviewTable({ compounds, errors }: CsvPreviewTableProps) {
  return (
    <div className="space-y-2">
      {errors && errors.length > 0 && (
        <div className="rounded-md border border-amber-900/50 bg-amber-950/30 p-2">
          {errors.map((err, i) => (
            <p key={i} className="text-xs text-amber-400">{err}</p>
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
                  i % 2 === 0 ? "bg-background" : "bg-surface/30"
                )}
              >
                <td className="px-3 py-1 tabular-nums text-faint">{i + 1}</td>
                <td className="px-3 py-1 text-dim">{c.name}</td>
                <td className="max-w-[200px] truncate px-3 py-1 font-mono text-subtle" title={c.smiles}>
                  {c.smiles}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
