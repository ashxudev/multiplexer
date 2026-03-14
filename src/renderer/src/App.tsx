import { useEffect } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { WorkspaceView } from '@/components/layout/WorkspaceView';

// Preload Mol* modules so the 3D viewer renders instantly on first open
import('molstar/lib/mol-plugin/context').catch(() => {});
import('molstar/lib/mol-plugin/spec').catch(() => {});
import { SettingsPage } from '@/components/pages/SettingsPage';
import { NewCampaignPage } from '@/components/pages/NewCampaignPage';
import { NewRunPage } from '@/components/pages/NewRunPage';
import { CampaignDetailPage } from '@/components/pages/CampaignDetailPage';
import { useAppStore } from '@/stores/useAppStore';
import { useBackendEvents } from '@/hooks/useBackendEvents';

function App() {
  const currentView = useAppStore((s) => s.currentView);
  const setView = useAppStore((s) => s.setView);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const selectCompound = useAppStore((s) => s.selectCompound);
  const selectedCampaignId = useAppStore((s) => s.selectedCampaignId);

  // Subscribe to backend events
  useBackendEvents();

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;

      // Cmd+B — toggle sidebar
      if (mod && e.key === 'b') {
        e.preventDefault();
        toggleSidebar();
      }

      // Cmd+, — settings
      if (mod && e.key === ',') {
        e.preventDefault();
        setView('settings');
      }

      // Cmd+Shift+N — new run (if campaign selected)
      if (mod && e.shiftKey && e.key === 'N') {
        e.preventDefault();
        if (selectedCampaignId) {
          setView('new-run');
        }
      }

      // Escape — close detail panel or go back
      if (e.key === 'Escape') {
        if (currentView !== 'workspace') {
          setView('workspace');
        } else {
          selectCompound(null);
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentView, selectedCampaignId, setView, toggleSidebar, selectCompound]);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <TopBar />
      <div className="flex-1 overflow-hidden">
        {currentView === 'workspace' && <WorkspaceView />}
        {currentView === 'settings' && <SettingsPage />}
        {currentView === 'new-campaign' && <NewCampaignPage />}
        {currentView === 'new-run' && <NewRunPage />}
        {currentView === 'campaign-detail' && <CampaignDetailPage />}
      </div>
    </div>
  );
}

export default App;
