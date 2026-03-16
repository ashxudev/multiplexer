import { Settings } from 'lucide-react';
import { useAppStore } from '@/stores/useAppStore';

export function SidebarFooter() {
  const setView = useAppStore((s) => s.setView);

  return (
    <div className="flex items-center justify-start border-t border-border px-3 py-2">
      <button
        onClick={() => setView('settings')}
        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors outline-none"
        title="Settings"
      >
        <Settings className="h-4 w-4" />
      </button>
    </div>
  );
}
