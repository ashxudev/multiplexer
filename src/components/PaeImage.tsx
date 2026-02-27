import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Loader2 } from "lucide-react";
import * as api from "@/lib/tauri-api";

interface PaeImageProps {
  compoundId: string;
  sampleIndex: number;
}

export function PaeImage({ compoundId, sampleIndex }: PaeImageProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSrc(null);

    api
      .getPaeImagePath(compoundId, sampleIndex)
      .then((path) => {
        if (!cancelled) {
          setSrc(convertFileSrc(path));
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [compoundId, sampleIndex]);

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900/50">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (error || !src) {
    return (
      <div className="flex h-40 items-center justify-center rounded-md border border-dashed border-zinc-800 bg-zinc-900/50">
        <span className="text-xs text-zinc-600">
          {error ?? "PAE image not available"}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={`PAE heatmap — sample ${sampleIndex + 1}`}
      className="w-full rounded-md border border-zinc-800"
    />
  );
}
