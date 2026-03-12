import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';

interface CsvColumnMapperProps {
  headers: string[];
  smilesCol: string | null;
  nameCol: string | null;
  onSmilesColChange: (col: string) => void;
  onNameColChange: (col: string | null) => void;
}

export function CsvColumnMapper({
  headers,
  smilesCol,
  nameCol,
  onSmilesColChange,
  onNameColChange,
}: CsvColumnMapperProps) {
  return (
    <div className="flex items-end gap-4">
      <div className="space-y-1">
        <Label className="text-xs">SMILES column</Label>
        <Select value={smilesCol ?? ''} onValueChange={onSmilesColChange}>
          <SelectTrigger size="sm" className="text-xs">
            <SelectValue placeholder="Select column…" />
          </SelectTrigger>
          <SelectContent>
            {headers.map((h) => (
              <SelectItem key={h} value={h} className="text-xs">
                {h}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Name column</Label>
        <Select
          value={nameCol ?? '__none__'}
          onValueChange={(v) => onNameColChange(v === '__none__' ? null : v)}
        >
          <SelectTrigger size="sm" className="text-xs">
            <SelectValue placeholder="Select column…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__" className="text-xs">
              (none)
            </SelectItem>
            {headers.map((h) => (
              <SelectItem key={h} value={h} className="text-xs">
                {h}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
