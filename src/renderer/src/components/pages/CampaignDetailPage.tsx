import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Check, Pencil, X } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useAppStore } from '@/stores/useAppStore';
import { trpc } from '@/api/trpc';

const TARGET_TYPE_LABELS: Record<string, string> = {
  protein: 'Protein',
  dna: 'DNA',
  rna: 'RNA',
};

export function CampaignDetailPage() {
  const setView = useAppStore((s) => s.setView);
  const selectedCampaignId = useAppStore((s) => s.selectedCampaignId);

  const campaigns = trpc.campaigns.list.useQuery();
  const renameMutation = trpc.campaigns.rename.useMutation();
  const descriptionMutation = trpc.campaigns.updateDescription.useMutation();
  const utils = trpc.useUtils();

  const campaign = campaigns.data?.find((c) => c.id === selectedCampaignId);

  // Editable name state
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Editable description state
  const [description, setDescription] = useState('');
  const [descriptionDirty, setDescriptionDirty] = useState(false);

  // Sync description from campaign data
  useEffect(() => {
    if (campaign && !descriptionDirty) {
      setDescription(campaign.description ?? '');
    }
  }, [campaign, descriptionDirty]);

  const startEditingName = () => {
    if (!campaign) return;
    setEditName(campaign.display_name);
    setIsEditingName(true);
    setTimeout(() => nameInputRef.current?.select(), 0);
  };

  const saveName = async () => {
    if (!campaign || !editName.trim() || editName.trim() === campaign.display_name) {
      setIsEditingName(false);
      return;
    }
    try {
      await renameMutation.mutateAsync({
        campaignId: campaign.id,
        newName: editName.trim(),
      });
      await utils.campaigns.list.invalidate();
    } catch {
      // mutation error surfaced by renameMutation.error if needed
    }
    setIsEditingName(false);
  };

  const cancelEditName = () => {
    setIsEditingName(false);
  };

  const saveDescription = async () => {
    if (!campaign) return;
    const value = description.trim() || null;
    if (value === (campaign.description ?? null)) {
      setDescriptionDirty(false);
      return;
    }
    try {
      await descriptionMutation.mutateAsync({
        campaignId: campaign.id,
        description: value,
      });
      await utils.campaigns.list.invalidate();
    } catch {
      // mutation error surfaced by descriptionMutation.error if needed
    }
    setDescriptionDirty(false);
  };

  if (!campaign) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        No campaign selected
      </div>
    );
  }

  const createdDate = new Date(campaign.created_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

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
        {/* Campaign name — click to edit */}
        <div className="group">
          {isEditingName ? (
            <div className="flex items-center gap-2">
              <Input
                ref={nameInputRef}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveName();
                  if (e.key === 'Escape') cancelEditName();
                }}
                className="text-xl font-semibold h-auto py-1"
                autoFocus
              />
              <button
                onClick={saveName}
                className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                onClick={cancelEditName}
                className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={startEditingName}
              className="flex items-center gap-2 text-left"
            >
              <h1 className="text-xl font-semibold">{campaign.display_name}</h1>
              <Pencil className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          )}
        </div>

        {/* Target type */}
        <div className="space-y-2">
          <Label className="text-muted-foreground">Target Type</Label>
          <p className="text-sm">{TARGET_TYPE_LABELS[campaign.target_type] ?? campaign.target_type}</p>
        </div>

        {/* Target sequence */}
        <div className="space-y-2">
          <Label className="text-muted-foreground">
            {TARGET_TYPE_LABELS[campaign.target_type] ?? ''} Sequence
          </Label>
          <div className="rounded-md border border-border bg-muted px-3 py-2 text-sm font-mono text-muted-foreground max-h-32 overflow-auto break-all">
            {campaign.target_sequence}
          </div>
        </div>

        {/* Description — editable */}
        <div className="space-y-2">
          <Label className="text-muted-foreground">
            Description <span className="text-faint font-normal">(optional)</span>
          </Label>
          <Textarea
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              setDescriptionDirty(true);
            }}
            onBlur={saveDescription}
            placeholder="Notes about this campaign..."
            rows={3}
            className="text-sm"
          />
          {descriptionMutation.isPending && (
            <p className="text-xs text-muted-foreground">Saving...</p>
          )}
        </div>

        {/* Created date */}
        <div className="space-y-2">
          <Label className="text-muted-foreground">Created</Label>
          <p className="text-sm">{createdDate}</p>
        </div>
      </div>
    </div>
  );
}
