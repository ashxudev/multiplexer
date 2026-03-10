import { useState, useMemo } from 'react';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { useAppStore } from '@/stores/useAppStore';
import { trpc } from '@/api/trpc';
import { CsvPreviewTable } from '@/components/forms/CsvPreviewTable';
import { useRdkit } from '@/components/shared/RdkitProvider';

interface ParsedCompound {
  name: string;
  smiles: string;
}

function parseSmilesList(text: string): ParsedCompound[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, i) => {
      const parts = line.split(/[,\t]/);
      if (parts.length >= 2) {
        return { name: parts[0].trim(), smiles: parts[1].trim() };
      }
      return { name: `Compound ${i + 1}`, smiles: line };
    });
}

export function NewRunPage() {
  const setView = useAppStore((s) => s.setView);
  const selectedCampaignId = useAppStore((s) => s.selectedCampaignId);
  const selectRun = useAppStore((s) => s.selectRun);

  const campaigns = trpc.campaigns.list.useQuery();
  const createMutation = trpc.runs.create.useMutation();
  const utils = trpc.useUtils();

  const { rdkit, ready: rdkitReady } = useRdkit();

  const campaign = campaigns.data?.find((c) => c.id === selectedCampaignId);

  const [runName, setRunName] = useState('');
  const [smilesText, setSmilesText] = useState('');
  const [inputMode, setInputMode] = useState<'paste' | 'csv'>('paste');
  const [error, setError] = useState<string | null>(null);
  const [paramsOpen, setParamsOpen] = useState(false);

  // Parameters
  const [recyclingSteps, setRecyclingSteps] = useState(3);
  const [diffusionSamples, setDiffusionSamples] = useState(1);
  const [samplingSteps, setSamplingSteps] = useState(200);
  const [stepScale, setStepScale] = useState(1.5);

  const compounds = useMemo(() => parseSmilesList(smilesText), [smilesText]);

  const invalidIndices = useMemo(() => {
    if (!rdkit || !rdkitReady) return new Set<number>();
    const invalid = new Set<number>();
    for (let i = 0; i < compounds.length; i++) {
      try {
        const mol = rdkit.get_mol(compounds[i].smiles);
        if (!mol) {
          invalid.add(i);
        } else {
          mol.delete();
        }
      } catch {
        invalid.add(i);
      }
    }
    return invalid;
  }, [rdkit, rdkitReady, compounds]);

  const hasInvalidSmiles = invalidIndices.size > 0;
  const validationPending = compounds.length > 0 && !rdkitReady;

  const validationErrors = useMemo(() => {
    if (!hasInvalidSmiles) return undefined;
    const count = invalidIndices.size;
    return [`${count} compound${count > 1 ? 's have' : ' has'} invalid SMILES — fix or remove before submitting.`];
  }, [hasInvalidSmiles, invalidIndices.size]);

  const handleSubmit = async () => {
    if (!runName.trim() || compounds.length === 0 || !selectedCampaignId || hasInvalidSmiles || validationPending) return;

    setError(null);
    try {
      const run = await createMutation.mutateAsync({
        campaignId: selectedCampaignId,
        displayName: runName.trim(),
        compounds,
        params: {
          recycling_steps: recyclingSteps,
          diffusion_samples: diffusionSamples,
          sampling_steps: samplingSteps,
          step_scale: stepScale,
        },
      });

      await utils.campaigns.list.invalidate();
      selectRun(run.id);
      setView('workspace');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result;
      if (typeof text === 'string') {
        setSmilesText(text);
      }
    };
    reader.readAsText(file);
  };

  if (!campaign) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        No campaign selected
      </div>
    );
  }

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
        <h1 className="text-xl font-semibold">
          New Run — {campaign.display_name}
        </h1>

        {/* Run name */}
        <div className="space-y-2">
          <Label>Run Name</Label>
          <Input
            value={runName}
            onChange={(e) => setRunName(e.target.value)}
            placeholder="e.g. Batch 1"
            autoFocus
          />
        </div>

        {/* Target sequence (read-only) */}
        <div className="space-y-2">
          <Label>
            {campaign.target_type === 'dna' ? 'DNA' : campaign.target_type === 'rna' ? 'RNA' : 'Protein'} Sequence
          </Label>
          <div className="rounded-md border border-border bg-muted px-3 py-2 text-sm font-mono text-muted-foreground max-h-24 overflow-auto">
            {campaign.target_sequence}
          </div>
        </div>

        {campaign.target_type !== 'protein' && (
          <div className="rounded-md border border-blue-900/50 bg-blue-950/30 p-3">
            <p className="text-xs text-blue-400">
              This campaign targets {campaign.target_type.toUpperCase()}. Affinity metrics
              (binding confidence, optimization score) will not be available for these predictions.
            </p>
          </div>
        )}

        {/* SMILES input */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Compounds</Label>
            <div className="flex gap-1 rounded-md border border-border p-0.5">
              <button
                onClick={() => setInputMode('paste')}
                className={`rounded px-2 py-0.5 text-xs transition-colors ${
                  inputMode === 'paste'
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Paste
              </button>
              <button
                onClick={() => setInputMode('csv')}
                className={`rounded px-2 py-0.5 text-xs transition-colors ${
                  inputMode === 'csv'
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                CSV
              </button>
            </div>
          </div>

          {inputMode === 'paste' ? (
            <Textarea
              value={smilesText}
              onChange={(e) => setSmilesText(e.target.value)}
              placeholder="One SMILES per line, or name,SMILES per line"
              rows={6}
              className="font-mono text-sm"
            />
          ) : (
            <Input type="file" accept=".csv,.tsv,.txt" onChange={handleCsvUpload} />
          )}

          {compounds.length > 0 && (
            <CsvPreviewTable
              compounds={compounds}
              errors={validationErrors}
              invalidIndices={invalidIndices}
            />
          )}
        </div>

        {/* Advanced Parameters (collapsed by default) */}
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => setParamsOpen((s) => !s)}
            aria-expanded={paramsOpen}
            aria-controls="advanced-parameters"
            className="flex items-center gap-1.5 text-sm font-medium hover:text-foreground transition-colors"
          >
            <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", paramsOpen && "rotate-90")} />
            Advanced Parameters
          </button>
          {paramsOpen && (
            <div id="advanced-parameters" className="space-y-4 pl-5">
              <ParamSlider label="Recycling Steps" value={recyclingSteps} onChange={setRecyclingSteps} min={1} max={10} step={1} tooltip="Number of iterative refinement passes — the model feeds its output back as input to improve prediction accuracy." />
              <ParamSlider label="Diffusion Samples" value={diffusionSamples} onChange={setDiffusionSamples} min={1} max={10} step={1} tooltip="Number of independent structure predictions to generate, each from different random noise. Higher values explore more conformations but cost more compute." />
              <ParamSlider label="Sampling Steps" value={samplingSteps} onChange={setSamplingSteps} min={50} max={500} step={50} tooltip="Number of denoising steps in the diffusion process. More steps = higher quality predictions but slower." />
              <ParamSlider label="Step Scale" value={stepScale} onChange={setStepScale} min={0.5} max={3.0} step={0.1} tooltip="Diffusion temperature scaling. Lower values produce more diverse samples, higher values are more conservative. Recommended range: 1–2." />
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-md border border-red-900/50 bg-red-950/30 p-3">
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}

        <div className="flex justify-end">
          <Button
            onClick={handleSubmit}
            disabled={!runName.trim() || compounds.length === 0 || hasInvalidSmiles || validationPending || createMutation.isPending}
          >
            {createMutation.isPending
              ? 'Submitting...'
              : validationPending
                ? 'Validating…'
                : hasInvalidSmiles
                  ? `${invalidIndices.size} Invalid SMILES`
                  : 'Submit'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ParamSlider({
  label,
  value,
  onChange,
  min,
  max,
  step,
  tooltip,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  tooltip?: string;
}) {
  const labelEl = tooltip ? (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Label className="text-xs border-b border-dotted border-muted-foreground cursor-help">{label}</Label>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ) : (
    <Label className="text-xs">{label}</Label>
  );

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        {labelEl}
        <span className="text-xs tabular-nums text-muted-foreground">{value}</span>
      </div>
      <Slider
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        min={min}
        max={max}
        step={step}
      />
    </div>
  );
}
