import { useState } from 'react';
import { ArrowLeft, Key, FolderOpen, Paintbrush, Sun, Moon, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAppStore } from '@/stores/useAppStore';
import { useTheme, type Theme } from '@/hooks/useTheme';
import { trpc } from '@/api/trpc';
import { cn } from '@/lib/utils';

type SettingsSection = 'general' | 'workspace' | 'appearance';

const SECTIONS: { id: SettingsSection; label: string; icon: typeof Key }[] = [
  { id: 'general', label: 'General', icon: Key },
  { id: 'workspace', label: 'Workspace', icon: FolderOpen },
  { id: 'appearance', label: 'Appearance', icon: Paintbrush },
];

export function SettingsPage() {
  const setView = useAppStore((s) => s.setView);
  const [activeSection, setActiveSection] = useState<SettingsSection>('general');

  return (
    <div className="flex h-full bg-sidebar">
      {/* Settings nav sidebar */}
      <div className="w-56 shrink-0 flex flex-col overflow-auto">
        <div className="px-3 pt-4 pb-2">
          <button
            onClick={() => setView('workspace')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-accent/50 mb-2"
          >
            <ArrowLeft className="size-4" />
            Back
          </button>
          <h1 className="text-lg font-semibold px-3 mb-3">Settings</h1>
        </div>

        <nav className="px-3 space-y-0.5">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm transition-colors',
                activeSection === s.id
                  ? 'bg-accent text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
              )}
            >
              <s.icon className="size-4" />
              {s.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Settings content */}
      <div className="flex-1 m-3 bg-background rounded-lg overflow-auto">
        <div className="p-8 max-w-2xl">
          {activeSection === 'general' && <GeneralSettings />}
          {activeSection === 'workspace' && <WorkspaceSettings />}
          {activeSection === 'appearance' && <AppearanceSettings />}
        </div>
      </div>
    </div>
  );
}

function GeneralSettings() {
  const settings = trpc.settings.get.useQuery();
  const saveMutation = trpc.settings.save.useMutation();
  const testConnection = trpc.settings.testConnection.useQuery(undefined, {
    enabled: false,
  });

  const [apiKey, setApiKey] = useState(settings.data?.api_key ?? '');
  const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  // Sync when data loads
  if (settings.data && apiKey === '' && settings.data.api_key) {
    setApiKey(settings.data.api_key);
  }

  const handleSave = () => {
    saveMutation.mutate({ apiKey: apiKey || null });
  };

  const handleTest = async () => {
    setTestStatus('loading');
    try {
      const result = await testConnection.refetch();
      setTestStatus(result.data ? 'success' : 'error');
    } catch {
      setTestStatus('error');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">General</h2>
        <p className="text-sm text-muted-foreground">API keys and connection settings</p>
      </div>

      <div className="space-y-2">
        <Label>Boltz API Key</Label>
        <Input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="boltzpk_live_..."
        />
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={handleTest} variant="outline" size="sm" disabled={!apiKey}>
          Test Connection
        </Button>
        {testStatus === 'loading' && <span className="text-xs text-muted-foreground">Testing...</span>}
        {testStatus === 'success' && <span className="text-xs text-emerald-500">Connected</span>}
        {testStatus === 'error' && <span className="text-xs text-red-400">Failed</span>}
      </div>

      <Button onClick={handleSave} disabled={saveMutation.isPending}>
        {saveMutation.isPending ? 'Saving...' : 'Save'}
      </Button>
    </div>
  );
}

function WorkspaceSettings() {
  const settings = trpc.settings.get.useQuery();
  const saveMutation = trpc.settings.save.useMutation();
  const selectDir = trpc.settings.selectRootDir.useMutation();
  const utils = trpc.useUtils();

  const rootDir = settings.data?.root_dir ?? '';

  const handleChooseFolder = async () => {
    const result = await selectDir.mutateAsync();
    if (result) {
      await saveMutation.mutateAsync({ rootDir: result });
      utils.settings.get.invalidate();
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Workspace</h2>
        <p className="text-sm text-muted-foreground">Configure your workspace directory</p>
      </div>

      <div className="space-y-2">
        <Label>Workspace Root</Label>
        <div className="flex items-center gap-3">
          <code className="flex-1 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground truncate">
            {rootDir}
          </code>
          <Button
            variant="outline"
            size="sm"
            onClick={handleChooseFolder}
            disabled={selectDir.isPending}
          >
            Choose Folder
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Campaign data and results are stored here.
        </p>
      </div>
    </div>
  );
}

function AppearanceSettings() {
  const { theme, setTheme } = useTheme();

  const options: { value: Theme; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Monitor },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Appearance</h2>
        <p className="text-sm text-muted-foreground">Customize how Multiplexer looks</p>
      </div>

      <div className="space-y-2">
        <Label>Theme</Label>
        <div className="flex gap-1 rounded-md border border-border p-1 w-fit">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTheme(opt.value)}
              className={cn(
                'flex items-center gap-1.5 rounded px-3 py-1.5 text-sm transition-colors',
                theme === opt.value
                  ? 'bg-muted text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <opt.icon className="h-4 w-4" />
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
