import { FlaskConical, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppStore } from "@/stores/useAppStore";

export function OnboardingCard() {
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);

  return (
    <div className="flex h-full items-center justify-center">
      <Card className="w-full max-w-md border-zinc-800 bg-zinc-900">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800">
            <FlaskConical className="h-6 w-6 text-zinc-400" />
          </div>
          <CardTitle className="text-xl">Welcome to Multiplexer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-sm text-zinc-400">
            Set up your Boltz API key to get started with molecular docking
            predictions.
          </p>
          <Button
            onClick={() => setSettingsOpen(true)}
            className="w-full"
          >
            <KeyRound className="mr-2 h-4 w-4" />
            Set up API key
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
