import { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAppStore } from '@/stores/useAppStore';
import { trpc } from '@/api/trpc';

type TargetType = 'protein' | 'dna' | 'rna';

function stripFasta(input: string): string {
  return input
    .split(/\r?\n/)
    .filter((l) => !l.startsWith('>'))
    .join('')
    .replace(/[\s\d]/g, '');
}

const AMINO_ACIDS_RE = /^[A-Z]+$/i;
const DNA_RE = /^[ACGTacgt]+$/;
const RNA_RE = /^[ACGUacgu]+$/;

function validateSequence(seq: string, targetType: TargetType): string | null {
  if (!seq) return null;

  if (targetType === 'dna') {
    if (!DNA_RE.test(seq)) {
      const invalid = [...new Set(seq.match(/[^ACGTacgt]/g))];
      return `Invalid characters: ${invalid.join(', ')}. DNA sequences can only contain A, C, G, T.`;
    }
  } else if (targetType === 'rna') {
    if (!RNA_RE.test(seq)) {
      const invalid = [...new Set(seq.match(/[^ACGUacgu]/g))];
      return `Invalid characters: ${invalid.join(', ')}. RNA sequences can only contain A, C, G, U.`;
    }
  } else {
    if (!AMINO_ACIDS_RE.test(seq)) {
      const invalid = [...new Set(seq.match(/[^A-Za-z]/g))];
      return `Invalid characters: ${invalid.join(', ')}. Only amino acid letters are allowed.`;
    }
  }
  return null;
}

const SEQUENCE_LABELS: Record<TargetType, string> = {
  protein: 'Protein Sequence',
  dna: 'DNA Sequence',
  rna: 'RNA Sequence',
};

const SEQUENCE_PLACEHOLDERS: Record<TargetType, string> = {
  protein: 'Paste sequence or FASTA format (headers will be stripped)...',
  dna: 'Paste DNA sequence (A, C, G, T characters only)...',
  rna: 'Paste RNA sequence (A, C, G, U characters only)...',
};

export function NewCampaignPage() {
  const setView = useAppStore((s) => s.setView);
  const selectCampaign = useAppStore((s) => s.selectCampaign);
  const toggleCampaignExpanded = useAppStore((s) => s.toggleCampaignExpanded);

  const createMutation = trpc.campaigns.create.useMutation();
  const utils = trpc.useUtils();

  const [name, setName] = useState('');
  const [targetType, setTargetType] = useState<TargetType>('protein');
  const [sequence, setSequence] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sequenceError, setSequenceError] = useState<string | null>(null);

  // Re-validate when target type changes
  useEffect(() => {
    if (sequence) {
      const cleaned = stripFasta(sequence);
      setSequenceError(cleaned ? validateSequence(cleaned, targetType) : null);
    }
  }, [targetType]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = async () => {
    if (!name.trim() || !sequence.trim()) return;

    const cleaned = stripFasta(sequence);
    if (!cleaned) {
      setError('No sequence found. If pasting FASTA, include sequence lines below the header.');
      return;
    }
    const validationError = validateSequence(cleaned, targetType);
    setSequenceError(validationError);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    try {
      const campaign = await createMutation.mutateAsync({
        displayName: name.trim(),
        targetSequence: cleaned,
        targetType,
        description: description.trim() || null,
      });

      await utils.campaigns.list.invalidate();
      selectCampaign(campaign.id);
      toggleCampaignExpanded(campaign.id);
      setView('workspace');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="h-full overflow-auto p-6">
      <button
        onClick={() => setView('workspace')}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      <div className="mx-auto max-w-2xl space-y-6">
        <h1 className="text-xl font-semibold">New Campaign</h1>

        <div className="space-y-2">
          <Label>Campaign Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. EGFR Inhibitor Screen"
            autoFocus
          />
        </div>

        <div className="space-y-2">
          <Label>Target Type</Label>
          <Select value={targetType} onValueChange={(v) => setTargetType(v as TargetType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="protein">Protein</SelectItem>
              <SelectItem value="dna">DNA</SelectItem>
              <SelectItem value="rna">RNA</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {targetType !== 'protein' && (
          <div className="rounded-md border border-blue-900/50 bg-blue-950/30 p-3">
            <p className="text-xs text-blue-400">
              Affinity metrics (binding confidence, optimization score) are not available
              for {targetType.toUpperCase()} targets. Structural prediction metrics will still
              be computed.
            </p>
          </div>
        )}

        <div className="space-y-2">
          <Label>{SEQUENCE_LABELS[targetType]}</Label>
          <Textarea
            value={sequence}
            onChange={(e) => {
              setSequence(e.target.value);
              if (sequenceError) setSequenceError(null);
            }}
            onBlur={() => {
              const cleaned = stripFasta(sequence);
              if (cleaned !== sequence) setSequence(cleaned);
              if (cleaned) {
                setSequenceError(validateSequence(cleaned, targetType));
              } else {
                setSequenceError(null);
              }
            }}
            placeholder={SEQUENCE_PLACEHOLDERS[targetType]}
            rows={6}
            className="font-mono text-sm"
          />
          {sequenceError && (
            <p className="text-xs text-red-400 mt-1">{sequenceError}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label>
            Description <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Notes about this campaign..."
            rows={3}
          />
        </div>

        {error && (
          <div className="rounded-md border border-red-900/50 bg-red-950/30 p-3">
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}

        <div className="flex justify-end">
          <Button
            onClick={handleCreate}
            disabled={!name.trim() || !sequence.trim() || !!sequenceError || createMutation.isPending}
          >
            {createMutation.isPending ? 'Creating...' : 'Create'}
          </Button>
        </div>
      </div>
    </div>
  );
}
