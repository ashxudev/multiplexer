import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { trpc } from '@/api/trpc';

interface UpdateToastProps {
  onDismiss: () => void;
}

export function UpdateToast({ onDismiss }: UpdateToastProps) {
  const installMutation = trpc.autoUpdate.install.useMutation();
  const dismissMutation = trpc.autoUpdate.dismiss.useMutation({
    onSuccess: () => onDismiss(),
  });

  const handleRestart = () => {
    installMutation.mutate();
  };

  const handleDismiss = () => {
    dismissMutation.mutate();
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="relative min-w-[340px] rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-lg">
        <button
          type="button"
          onClick={handleDismiss}
          className="absolute -top-2 -left-2 flex size-4 items-center justify-center rounded-full bg-popover text-muted-foreground shadow-sm ring-1 ring-border hover:text-foreground outline-none"
          aria-label="Dismiss"
        >
          <X className="size-2.5" />
        </button>
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">
              New update available
            </span>
            <span className="text-sm text-muted-foreground">
              Restart to use the latest.
            </span>
          </div>
          <Button
            size="sm"
            onClick={handleRestart}
            disabled={installMutation.isPending}
            className="shrink-0"
          >
            {installMutation.isPending ? 'Restarting...' : 'Restart'}
          </Button>
        </div>
      </div>
    </div>
  );
}
