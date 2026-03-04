import { FlaskConical, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppStore } from "@/stores/useAppStore";

export function OnboardingCard() {
  const setView = useAppStore((s) => s.setView);

  return (
    <div className="flex h-full items-center justify-center">
      <Card className="w-full max-w-md border-border bg-surface">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <FlaskConical className="h-6 w-6 text-muted-foreground" />
          </div>
          <CardTitle className="text-xl">Welcome to Multiplexer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-sm text-muted-foreground">
            Set up your Boltz API key to get started with molecular docking
            predictions.
          </p>
          <Button
            onClick={() => setView('settings')}
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
