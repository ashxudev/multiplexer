import { useState, useMemo, useEffect, useCallback } from 'react';
import { ArrowLeft, ChevronRight, Upload } from 'lucide-react';
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
import { CsvColumnMapper } from '@/components/forms/CsvColumnMapper';
import { useRdkit } from '@/components/shared/RdkitProvider';
import { parseFile, extractCompoundsFromColumns } from '@/lib/csv-parser';
import type { ParsedCompound } from '@/types/compounds';

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

  const [runName, setRunName] = useState(() => {
    const count = campaign?.runs?.length ?? 0;
    return `Run ${count + 1}`;
  });
  const [smilesText, setSmilesText] = useState('');
  const [inputMode, setInputMode] = useState<'paste' | 'csv'>('paste');
  const [error, setError] = useState<string | null>(null);
  const [paramsOpen, setParamsOpen] = useState(false);

  // CSV file import state
  const [fileCompounds, setFileCompounds] = useState<ParsedCompound[] | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[] | null>(null);
  const [needsManualMapping, setNeedsManualMapping] = useState(false);
  const [selectedSmilesCol, setSelectedSmilesCol] = useState<string | null>(null);
  const [selectedNameCol, setSelectedNameCol] = useState<string | null>(null);
  const [csvRawText, setCsvRawText] = useState<string | null>(null);
  const [csvFileName, setCsvFileName] = useState<string | null>(null);

  const [isDragging, setIsDragging] = useState(false);

  // Parameters
  const [recyclingSteps, setRecyclingSteps] = useState(3);
  const [diffusionSamples, setDiffusionSamples] = useState(1);
  const [samplingSteps, setSamplingSteps] = useState(200);
  const [stepScale, setStepScale] = useState(1.5);

  const compounds = useMemo(() => {
    if (fileCompounds) return fileCompounds;
    return parseSmilesList(smilesText);
  }, [fileCompounds, smilesText]);

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

  const openCsvFile = trpc.actions.openCsvFile.useMutation();

  const ACCEPTED_EXTENSIONS = new Set(['csv', 'tsv', 'txt', 'smi', 'smiles']);

  const processFile = useCallback((content: string, fileName: string) => {
    setCsvRawText(content);
    setCsvFileName(fileName);
    setError(null);

    const parsed = parseFile(content, fileName);

    if (parsed.needsManualMapping) {
      setCsvHeaders(parsed.headers);
      setNeedsManualMapping(true);
      setSelectedSmilesCol(null);
      setSelectedNameCol(null);
      setFileCompounds(null);
      return;
    }

    setNeedsManualMapping(false);
    setCsvHeaders(null);
    setFileCompounds(parsed.compounds);
  }, []);

  const handleLoadCsv = async () => {
    try {
      const result = await openCsvFile.mutateAsync();
      if (!result) return;
      processFile(result.content, result.fileName);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load CSV file');
    }
  };

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!ACCEPTED_EXTENSIONS.has(ext)) {
      setError(`Unsupported file type ".${ext}". Use .csv, .tsv, or .smi files.`);
      return;
    }

    try {
      const content = await file.text();
      processFile(content, file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to read file');
    }
  }, [processFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  // Re-extract compounds when user selects columns in manual mapping mode
  useEffect(() => {
    if (!needsManualMapping || !csvRawText || !selectedSmilesCol) return;
    const extracted = extractCompoundsFromColumns(csvRawText, selectedSmilesCol, selectedNameCol);
    setFileCompounds(extracted);
  }, [needsManualMapping, csvRawText, selectedSmilesCol, selectedNameCol]);

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
                onClick={() => {
                  setInputMode('paste');
                  setFileCompounds(null);
                  setCsvHeaders(null);
                  setNeedsManualMapping(false);
                  setCsvRawText(null);
                  setCsvFileName(null);
                }}
                className={`rounded px-2 py-0.5 text-xs transition-colors ${
                  inputMode === 'paste'
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Paste
              </button>
              <button
                onClick={() => {
                  setInputMode('csv');
                  setSmilesText('');
                }}
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
              className="font-mono text-sm max-h-40 overflow-auto"
            />
          ) : (
            <div className="space-y-3">
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={cn(
                  'rounded-md border-2 border-dashed p-6 text-center transition-colors',
                  isDragging
                    ? 'border-primary bg-primary/5'
                    : 'border-border',
                )}
              >
                <div className="flex flex-col items-center gap-3">
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">
                      Drag and drop a .csv or .smi file here, or
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleLoadCsv}
                      disabled={openCsvFile.isPending}
                    >
                      {openCsvFile.isPending ? 'Uploading…' : 'Upload CSV'}
                    </Button>
                  </div>
                  {csvFileName && (
                    <span className="text-xs text-muted-foreground truncate max-w-full">{csvFileName}</span>
                  )}
                </div>
              </div>

              {needsManualMapping && csvHeaders && (
                <CsvColumnMapper
                  headers={csvHeaders}
                  smilesCol={selectedSmilesCol}
                  nameCol={selectedNameCol}
                  onSmilesColChange={setSelectedSmilesCol}
                  onNameColChange={setSelectedNameCol}
                />
              )}
            </div>
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
