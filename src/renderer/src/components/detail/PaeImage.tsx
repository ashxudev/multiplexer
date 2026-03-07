import { Loader2 } from 'lucide-react';
import { trpc } from '@/api/trpc';

interface PaeImageProps {
  compoundId: string;
  sampleIndex: number;
}

export function PaeImage({ compoundId, sampleIndex }: PaeImageProps) {
  const imageQuery = trpc.compounds.getPaeImageData.useQuery(
    { compoundId, sampleIndex },
    { enabled: !!compoundId },
  );

  if (imageQuery.isLoading) {
    return (
      <div className="flex h-40 items-center justify-center rounded-md border border-border bg-surface/50">
        <Loader2 className="h-5 w-5 animate-spin text-subtle" />
      </div>
    );
  }

  if (imageQuery.isError || !imageQuery.data) {
    return (
      <div className="flex h-40 items-center justify-center rounded-md border border-dashed border-border bg-surface/50">
        <span className="text-xs text-faint">
          {imageQuery.error?.message ?? 'PAE image not available'}
        </span>
      </div>
    );
  }

  const src = imageQuery.data;

  return (
    <img
      src={src}
      alt={`PAE heatmap — sample ${sampleIndex + 1}`}
      className="w-full rounded-md border border-border"
    />
  );
}
