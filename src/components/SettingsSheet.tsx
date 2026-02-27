import { useEffect, useState } from "react";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAppStore } from "@/stores/useAppStore";
import * as api from "@/lib/tauri-api";

type ConnectionStatus = "idle" | "testing" | "success" | "error";

export function SettingsSheet() {
  const settingsOpen = useAppStore((s) => s.settingsOpen);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);

  const [apiKey, setApiKey] = useState("");
  const [rootDir, setRootDir] = useState("~/multiplexer");
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("idle");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Load settings when the sheet opens
  useEffect(() => {
    if (settingsOpen) {
      api.getSettings().then((settings) => {
        setApiKey(settings.api_key ?? "");
        setRootDir(settings.root_dir);
      }).catch(() => {
        // Not in Tauri context
      });
    }
  }, [settingsOpen]);

  const handleTestConnection = async () => {
    setConnectionStatus("testing");
    try {
      // Save the key first so test_connection can use it
      await api.saveSettings(apiKey, rootDir);
      const ok = await api.testConnection();
      setConnectionStatus(ok ? "success" : "error");
    } catch {
      setConnectionStatus("error");
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await api.saveSettings(apiKey, rootDir);
      // Reload campaigns after saving settings
      await useAppStore.getState().loadCampaigns();
      setSettingsOpen(false);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
      <SheetContent className="border-zinc-800 bg-zinc-950">
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
          <SheetDescription>
            Configure your Multiplexer environment.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 px-4">
          {/* API Key */}
          <div className="space-y-2">
            <Label htmlFor="api-key">Boltz API Key</Label>
            <Input
              id="api-key"
              type="password"
              placeholder="boltzpk_live_..."
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setConnectionStatus("idle");
              }}
              className="border-zinc-800 bg-zinc-900"
            />
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestConnection}
                disabled={!apiKey || connectionStatus === "testing"}
                className="border-zinc-800"
              >
                {connectionStatus === "testing" && (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                )}
                Test Connection
              </Button>
              {connectionStatus === "success" && (
                <span className="flex items-center gap-1 text-xs text-emerald-500">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Connected
                </span>
              )}
              {connectionStatus === "error" && (
                <span className="flex items-center gap-1 text-xs text-red-400">
                  <XCircle className="h-3.5 w-3.5" />
                  Connection failed
                </span>
              )}
            </div>
          </div>

          <Separator className="bg-zinc-800" />

          {/* Workspace */}
          <div className="space-y-2">
            <Label>Workspace Root</Label>
            <div className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-400">
              {rootDir}
            </div>
            <p className="text-xs text-zinc-500">
              Campaign data and results are stored here.
            </p>
          </div>

          <Separator className="bg-zinc-800" />

          {/* Save */}
          {saveError && (
            <div className="rounded-md border border-red-900/50 bg-red-950/30 p-3">
              <p className="text-xs text-red-400">{saveError}</p>
            </div>
          )}
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Save Settings
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
