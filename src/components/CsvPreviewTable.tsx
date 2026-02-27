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
      <div className="max-h-48 overflow-auto rounded-md border border-zinc-800">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-zinc-900">
            <tr>
              <th className="px-3 py-1.5 text-left font-medium text-zinc-500">#</th>
              <th className="px-3 py-1.5 text-left font-medium text-zinc-500">Name</th>
              <th className="px-3 py-1.5 text-left font-medium text-zinc-500">SMILES</th>
            </tr>
          </thead>
          <tbody>
            {compounds.map((c, i) => (
              <tr
                key={i}
                className={cn(
                  "border-t border-zinc-800/50",
                  i % 2 === 0 ? "bg-zinc-950" : "bg-zinc-900/30"
                )}
              >
                <td className="px-3 py-1 tabular-nums text-zinc-600">{i + 1}</td>
                <td className="px-3 py-1 text-zinc-300">{c.name}</td>
                <td className="max-w-[200px] truncate px-3 py-1 font-mono text-zinc-500" title={c.smiles}>
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
