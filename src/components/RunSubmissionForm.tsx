import { useState, useMemo, useRef } from "react";
import { ArrowLeft, Loader2, Send, Upload } from "lucide-react";
import Papa from "papaparse";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAppStore } from "@/stores/useAppStore";
import { CsvPreviewTable } from "@/components/CsvPreviewTable";
import * as api from "@/lib/tauri-api";

export function RunSubmissionForm() {
  const campaigns = useAppStore((s) => s.campaigns);
  const selectedCampaignId = useAppStore((s) => s.selectedCampaignId);
  const campaign = useMemo(
    () => campaigns.find((c) => c.id === selectedCampaignId),
    [campaigns, selectedCampaignId]
  );
  const setMainView = useAppStore((s) => s.setMainView);
  const addRunToCampaign = useAppStore((s) => s.addRunToCampaign);

  const [runName, setRunName] = useState("");
  const [smilesText, setSmilesText] = useState("");
  const [recyclingSteps, setRecyclingSteps] = useState(3);
  const [diffusionSamples, setDiffusionSamples] = useState(3);
  const [samplingSteps, setSamplingSteps] = useState(200);
  const [stepScale, setStepScale] = useState(1.638);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<"paste" | "csv">("paste");
  const [csvCompounds, setCsvCompounds] = useState<{ name: string; smiles: string }[]>([]);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pastedCompounds = useMemo(() => {
    return smilesText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line, i) => {
        const colonIdx = line.indexOf(":");
        if (colonIdx > 0) {
          return {
            name: line.slice(0, colonIdx).trim(),
            smiles: line.slice(colonIdx + 1).trim(),
          };
        }
        return { name: `Compound ${i + 1}`, smiles: line };
      });
  }, [smilesText]);

  const parsedCompounds = inputMode === "paste" ? pastedCompounds : csvCompounds;

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete(results) {
        const errors: string[] = [];
        const compounds: { name: string; smiles: string }[] = [];
        const rows = results.data as Record<string, string>[];

        // Try to find name and smiles columns (case-insensitive)
        const headers = results.meta.fields ?? [];
        const nameCol = headers.find((h) => /^name$/i.test(h));
        const smilesCol = headers.find((h) => /^smiles$/i.test(h));

        if (!smilesCol) {
          errors.push("CSV must have a \"smiles\" column.");
          setCsvErrors(errors);
          setCsvCompounds([]);
          return;
        }

        rows.forEach((row, i) => {
          const smiles = row[smilesCol]?.trim();
          if (!smiles) {
            errors.push(`Row ${i + 1}: missing SMILES`);
            return;
          }
          compounds.push({
            name: (nameCol ? row[nameCol]?.trim() : "") || `Compound ${i + 1}`,
            smiles,
          });
        });

        setCsvCompounds(compounds);
        setCsvErrors(errors);
      },
      error(err) {
        setCsvErrors([`CSV parse error: ${err.message}`]);
        setCsvCompounds([]);
      },
    });
    // Reset file input so the same file can be re-selected
    e.target.value = "";
  };

  const handleSubmit = async () => {
    if (!selectedCampaignId || parsedCompounds.length === 0 || !runName) return;

    setSubmitting(true);
    setError(null);
    try {
      const run = await api.createRun(
        selectedCampaignId,
        runName,
        parsedCompounds,
        {
          recycling_steps: recyclingSteps,
          diffusion_samples: diffusionSamples,
          sampling_steps: samplingSteps,
          step_scale: stepScale,
        }
      );
      addRunToCampaign(selectedCampaignId, run);
    } catch (e) {
      console.error("Failed to create run:", e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-zinc-800 px-4 py-3">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setMainView("results")}
          disabled={submitting}
          className="text-zinc-400 hover:text-zinc-200"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-lg font-semibold">New Run</h2>
          {campaign && (
            <p className="text-xs text-zinc-500">{campaign.display_name}</p>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="mx-auto max-w-2xl space-y-6 p-6">
          {/* Run name */}
          <div className="space-y-2">
            <Label htmlFor="run-name">Run Name</Label>
            <Input
              id="run-name"
              placeholder="e.g. Optimization round 2"
              value={runName}
              onChange={(e) => setRunName(e.target.value)}
              className="border-zinc-800 bg-zinc-900"
            />
          </div>

          {/* Protein sequence (read-only) */}
          <div className="space-y-2">
            <Label>Protein Sequence</Label>
            <div className="max-h-24 overflow-auto rounded-md border border-zinc-800 bg-zinc-900/50 px-3 py-2 font-mono text-xs text-zinc-500 break-all">
              {campaign?.protein_sequence ?? "No campaign selected"}
            </div>
          </div>

          <Separator className="bg-zinc-800" />

          {/* SMILES input — mode toggle */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Compounds</Label>
              <div className="flex rounded-md border border-zinc-800 text-xs">
                <button
                  className={`px-3 py-1 transition-colors ${inputMode === "paste" ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}
                  onClick={() => setInputMode("paste")}
                >
                  Paste
                </button>
                <button
                  className={`px-3 py-1 transition-colors ${inputMode === "csv" ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}
                  onClick={() => setInputMode("csv")}
                >
                  Upload CSV
                </button>
              </div>
            </div>

            {inputMode === "paste" ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">
                    One per line, or name: SMILES
                  </span>
                  {pastedCompounds.length > 0 && (
                    <span className="text-xs text-zinc-500">
                      {pastedCompounds.length} compound
                      {pastedCompounds.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                <Textarea
                  id="smiles"
                  placeholder={
                    "Aspirin: CC(=O)Oc1ccccc1C(=O)O\nc1ccc2c(c1)cc1ccc3cccc4ccc2c1c34"
                  }
                  value={smilesText}
                  onChange={(e) => {
                    setSmilesText(e.target.value);
                    setError(null);
                  }}
                  rows={8}
                  className="border-zinc-800 bg-zinc-900 font-mono text-sm"
                />
              </div>
            ) : (
              <div className="space-y-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleCsvUpload}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  className="w-full border-zinc-800 text-zinc-400"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Choose CSV File
                </Button>
                <p className="text-xs text-zinc-500">
                  CSV must have a <code className="text-zinc-400">smiles</code> column. Optional <code className="text-zinc-400">name</code> column.
                </p>
                {csvCompounds.length > 0 && (
                  <CsvPreviewTable compounds={csvCompounds} errors={csvErrors} />
                )}
                {csvCompounds.length === 0 && csvErrors.length > 0 && (
                  <CsvPreviewTable compounds={[]} errors={csvErrors} />
                )}
              </div>
            )}
          </div>

          <Separator className="bg-zinc-800" />

          {/* Prediction parameters */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-zinc-300">
              Prediction Parameters
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Recycling Steps</Label>
                  <span className="text-xs tabular-nums text-zinc-400">
                    {recyclingSteps}
                  </span>
                </div>
                <Slider
                  value={[recyclingSteps]}
                  onValueChange={([v]) => setRecyclingSteps(v)}
                  min={1}
                  max={10}
                  step={1}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Diffusion Samples</Label>
                  <span className="text-xs tabular-nums text-zinc-400">
                    {diffusionSamples}
                  </span>
                </div>
                <Slider
                  value={[diffusionSamples]}
                  onValueChange={([v]) => setDiffusionSamples(v)}
                  min={1}
                  max={5}
                  step={1}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Sampling Steps</Label>
                  <span className="text-xs tabular-nums text-zinc-400">
                    {samplingSteps}
                  </span>
                </div>
                <Slider
                  value={[samplingSteps]}
                  onValueChange={([v]) => setSamplingSteps(v)}
                  min={50}
                  max={500}
                  step={10}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Step Scale</Label>
                  <span className="text-xs tabular-nums text-zinc-400">
                    {stepScale.toFixed(2)}
                  </span>
                </div>
                <Slider
                  value={[stepScale]}
                  onValueChange={([v]) => setStepScale(v)}
                  min={0.5}
                  max={3.0}
                  step={0.01}
                />
              </div>
            </div>
          </div>

          <Separator className="bg-zinc-800" />

          {/* Error */}
          {error && (
            <div className="rounded-md border border-red-900/50 bg-red-950/30 p-3">
              <p className="text-xs font-medium text-red-400">Submission failed</p>
              <p className="mt-1 text-xs text-red-300/80">{error}</p>
            </div>
          )}

          {/* Submit */}
          <Button
            disabled={parsedCompounds.length === 0 || !runName || submitting}
            className="w-full"
            onClick={handleSubmit}
          >
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            {submitting
              ? "Submitting..."
              : `Submit ${parsedCompounds.length} job${parsedCompounds.length !== 1 ? "s" : ""}`}
          </Button>
        </div>
      </ScrollArea>
    </div>
  );
}
