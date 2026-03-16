import { PanelLeft } from 'lucide-react';
import { useAppStore } from '@/stores/useAppStore';
import { trpc } from '@/api/trpc';

export function TopBar() {
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const { data: platform } = trpc.window.getPlatform.useQuery();
  // Default to macOS padding while loading to avoid overlap with traffic lights
  const isMac = platform === undefined || platform === 'darwin';

  return (
    <div
      className="h-12 w-full flex items-center justify-between border-b border-border bg-sidebar select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div
        className="flex items-center gap-1.5 h-full"
        style={{ paddingLeft: isMac ? '88px' : '16px' }}
      >
        <button
          onClick={toggleSidebar}
          className="flex items-center justify-center size-7 rounded-md transition-colors text-muted-foreground hover:text-foreground hover:bg-accent/50 outline-none"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          title="Toggle sidebar (Cmd+B)"
        >
          <PanelLeft className="size-4" />
        </button>
      </div>
    </div>
  );
}
