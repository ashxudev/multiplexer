import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Key, FolderOpen, Paintbrush, Sun, Moon, Monitor, Eye, EyeOff, Loader2, CheckCircle2, XCircle, ExternalLink, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAppStore } from '@/stores/useAppStore';
import { useTheme, type Theme } from '@/hooks/useTheme';
import { useStructureTheme, type StructureTheme } from '@/hooks/useStructureTheme';
import { trpc } from '@/api/trpc';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

type SettingsSection = 'general' | 'workspace' | 'appearance' | 'notifications';

const SECTIONS: { id: SettingsSection; label: string; icon: typeof Key }[] = [
  { id: 'appearance', label: 'Appearance', icon: Paintbrush },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'workspace', label: 'Workspace Directory', icon: FolderOpen },
  { id: 'general', label: 'API Key', icon: Key },
];

export function SettingsPage() {
  const setView = useAppStore((s) => s.setView);
  const [activeSection, setActiveSection] = useState<SettingsSection>('appearance');

  return (
    <div className="flex h-full bg-sidebar">
      {/* Settings nav sidebar */}
      <div className="w-56 shrink-0 flex flex-col overflow-auto">
        <div className="px-3 pt-4 pb-2">
          <button
            onClick={() => setView('workspace')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-accent/50 mb-2 outline-none"
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
                'flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm transition-colors outline-none',
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
          {activeSection === 'notifications' && <NotificationSettings />}
        </div>
      </div>
    </div>
  );
}

function GeneralSettings() {
  const settings = trpc.settings.get.useQuery();
  const saveMutation = trpc.settings.save.useMutation();
  const testMutation = trpc.settings.testConnection.useMutation();

  const [apiKey, setApiKey] = useState(settings.data?.api_key ?? '');
  const [showKey, setShowKey] = useState(false);
  const [verifyStatus, setVerifyStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const nonceRef = useRef(0);
  const syncedRef = useRef(false);
  const userEditedRef = useRef(false);

  // Sync once when data first loads (skip auto-verify for saved key)
  if (settings.data && !syncedRef.current) {
    syncedRef.current = true;
    if (settings.data.api_key) {
      setApiKey(settings.data.api_key);
      setSaveStatus('saved');
    } else {
      setShowKey(true);
    }
  }

  // Auto-verify only on user edits
  useEffect(() => {
    clearTimeout(debounceRef.current);

    if (!userEditedRef.current) return;

    if (!apiKey || apiKey.length < 8) {
      setVerifyStatus('idle');
      return;
    }

    const nonce = ++nonceRef.current;
    setVerifyStatus('loading');
    debounceRef.current = setTimeout(async () => {
      try {
        const ok = await testMutation.mutateAsync({ apiKey });
        if (nonce === nonceRef.current) {
          setVerifyStatus(ok ? 'success' : 'error');
        }
      } catch {
        if (nonce === nonceRef.current) {
          setVerifyStatus('error');
        }
      }
    }, 600);

    return () => clearTimeout(debounceRef.current);
  }, [apiKey]);

  const handleRetry = () => {
    userEditedRef.current = true;
    // Bump nonce and re-trigger by toggling a verify cycle
    const nonce = ++nonceRef.current;
    setVerifyStatus('loading');
    testMutation.mutateAsync({ apiKey }).then(
      (ok) => { if (nonce === nonceRef.current) setVerifyStatus(ok ? 'success' : 'error'); },
      () => { if (nonce === nonceRef.current) setVerifyStatus('error'); },
    );
  };

  const handleSave = () => {
    saveMutation.mutate(
      { apiKey: apiKey || null },
      { onSuccess: () => setSaveStatus('saved') },
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">API Key</h2>
        <p className="text-sm text-muted-foreground">
          Connect to Boltz Lab for structure predictions.{' '}
          <a
            href="https://lab.boltz.bio"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 text-primary hover:underline"
          >
            Get an API key
            <ExternalLink className="h-3 w-3" />
          </a>
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label>Boltz API Key</Label>
          {verifyStatus === 'loading' && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          {verifyStatus === 'success' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
          {verifyStatus === 'error' && (
            <button type="button" onClick={handleRetry} className="flex items-center gap-1 text-red-600 dark:text-red-400 hover:text-red-500 dark:hover:text-red-300 transition-colors outline-none">
              <XCircle className="h-3.5 w-3.5" />
              <span className="text-xs">Retry</span>
            </button>
          )}
        </div>
        <div className="relative">
          <Input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => { setApiKey(e.target.value); setSaveStatus('idle'); userEditedRef.current = true; }}
            placeholder="boltzpk_live_..."
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors outline-none"
          >
            {showKey ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <Button onClick={handleSave} size="sm" disabled={saveStatus !== 'idle' || !apiKey || verifyStatus === 'error' || saveMutation.isPending}>
        {saveStatus === 'saved' ? <><CheckCircle2 className="h-3.5 w-3.5" /> Saved</> : 'Save'}
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
        <p className="text-sm text-muted-foreground">Configure your local workspace directory</p>
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
  const { structureTheme, setStructureTheme } = useStructureTheme();

  const themeOptions: { value: Theme; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Monitor },
  ];

  const structureOptions: { value: StructureTheme; label: string; icon: typeof Sun }[] = [
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
          {themeOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTheme(opt.value)}
              className={cn(
                'flex items-center gap-1.5 rounded px-3 py-1.5 text-sm transition-colors outline-none',
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

      <div className="space-y-2">
        <Label>Structure Viewer</Label>
        <p className="text-xs text-muted-foreground">
          Controls the 3D and 2D structure rendering background. "System" follows your theme above.
        </p>
        <div className="flex gap-1 rounded-md border border-border p-1 w-fit">
          {structureOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setStructureTheme(opt.value)}
              className={cn(
                'flex items-center gap-1.5 rounded px-3 py-1.5 text-sm transition-colors outline-none',
                structureTheme === opt.value
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

function NotificationSettings() {
  const notificationsEnabled = useAppStore((s) => s.notificationsEnabled);
  const setNotificationsEnabled = useAppStore((s) => s.setNotificationsEnabled);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Notifications</h2>
        <p className="text-sm text-muted-foreground">
          Configure desktop notification preferences
        </p>
      </div>

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label>Run completion</Label>
          <p className="text-xs text-muted-foreground">
            Show a desktop notification when a prediction run finishes
          </p>
        </div>
        <Switch
          checked={notificationsEnabled}
          onCheckedChange={setNotificationsEnabled}
        />
      </div>
    </div>
  );
}
