import { MessageSquare, CircleHelp, Settings } from 'lucide-react';
import { useAppStore } from '@/stores/useAppStore';

export function SidebarFooter() {
  const setView = useAppStore((s) => s.setView);

  return (
    <div className="flex items-center justify-between border-t border-border px-3 py-2">
      <button
        onClick={() => window.open('mailto:feedback@multiplexer.app', '_blank')}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <MessageSquare className="h-3.5 w-3.5" />
        Feedback
      </button>

      <div className="flex items-center gap-1">
        <button
          onClick={() => window.open('https://docs.multiplexer.app', '_blank')}
          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="Help"
        >
          <CircleHelp className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => setView('settings')}
          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="Settings"
        >
          <Settings className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
