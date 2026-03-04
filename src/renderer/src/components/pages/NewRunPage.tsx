import { useState, useMemo } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { useAppStore } from '@/stores/useAppStore';
import { trpc } from '@/api/trpc';
import { CsvPreviewTable } from '@/components/forms/CsvPreviewTable';

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

  const campaign = campaigns.data?.find((c) => c.id === selectedCampaignId);

  const [runName, setRunName] = useState('');
  const [smilesText, setSmilesText] = useState('');
  const [inputMode, setInputMode] = useState<'paste' | 'csv'>('paste');
  const [error, setError] = useState<string | null>(null);

  // Parameters
  const [recyclingSteps, setRecyclingSteps] = useState(3);
  const [diffusionSamples, setDiffusionSamples] = useState(1);
  const [samplingSteps, setSamplingSteps] = useState(200);
  const [stepScale, setStepScale] = useState(1.5);

  const compounds = useMemo(() => parseSmilesList(smilesText), [smilesText]);

  const handleSubmit = async () => {
    if (!runName.trim() || compounds.length === 0 || !selectedCampaignId) return;

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

        {/* Protein sequence (read-only) */}
        <div className="space-y-2">
          <Label>Protein Sequence</Label>
          <div className="rounded-md border border-border bg-muted px-3 py-2 text-sm font-mono text-muted-foreground max-h-24 overflow-auto">
            {campaign.protein_sequence}
          </div>
        </div>

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

          {compounds.length > 0 && <CsvPreviewTable compounds={compounds} />}
        </div>

        {/* Parameters */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium">Prediction Parameters</h3>
          <ParamSlider label="Recycling Steps" value={recyclingSteps} onChange={setRecyclingSteps} min={1} max={10} step={1} />
          <ParamSlider label="Diffusion Samples" value={diffusionSamples} onChange={setDiffusionSamples} min={1} max={10} step={1} />
          <ParamSlider label="Sampling Steps" value={samplingSteps} onChange={setSamplingSteps} min={50} max={500} step={50} />
          <ParamSlider label="Step Scale" value={stepScale} onChange={setStepScale} min={0.5} max={3.0} step={0.1} />
        </div>

        {error && (
          <div className="rounded-md border border-red-900/50 bg-red-950/30 p-3">
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}

        <div className="flex justify-end">
          <Button
            onClick={handleSubmit}
            disabled={!runName.trim() || compounds.length === 0 || createMutation.isPending}
          >
            {createMutation.isPending ? 'Submitting...' : 'Submit'}
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
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
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
