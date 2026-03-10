export function getMetricTier(
  value: number | null | undefined,
): 'good' | 'moderate' | 'poor' | null {
  if (value == null) return null;
  if (value >= 0.8) return 'good';
  if (value >= 0.5) return 'moderate';
  return 'poor';
}

export function getMetricColorClass(value: number | null | undefined): string {
  const tier = getMetricTier(value);
  switch (tier) {
    case 'good':
      return 'text-emerald-500';
    case 'moderate':
      return 'text-amber-400';
    case 'poor':
      return 'text-red-400';
    default:
      return 'text-muted-foreground';
  }
}
