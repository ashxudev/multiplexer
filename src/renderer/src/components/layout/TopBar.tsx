import { PanelLeft } from 'lucide-react';
import { useAppStore } from '@/stores/useAppStore';

export function TopBar() {
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);

  return (
    <div
      className="h-10 flex items-center border-b border-border bg-background select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Positioned after macOS traffic lights (approx 70px from left) */}
      <button
        onClick={toggleSidebar}
        className="ml-[70px] p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        title="Toggle sidebar (Cmd+B)"
      >
        <PanelLeft className="h-4 w-4" />
      </button>
    </div>
  );
}
