import { Key } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/stores/useAppStore";
import { PixelText } from "./PixelText";

export function OnboardingCard() {
  const setView = useAppStore((s) => s.setView);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-12">
      <div className="flex flex-col items-center gap-8">
        <PixelText text="MULTIPLEXER" className="h-14 w-auto text-foreground" />
        <PixelText text="FOR BOLTZ" className="h-5 w-auto text-muted-foreground" />
      </div>

      <Button
        onClick={() => setView("settings")}
        className="w-full max-w-xs"
      >
        <Key className="mr-2 h-4 w-4" />
        Set up Boltz Lab API key
      </Button>
    </div>
  );
}
