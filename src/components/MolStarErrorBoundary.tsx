import { Component, type ReactNode, Fragment } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  retryCount: number;
}

export class MolStarErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, retryCount: 0 };

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("MolStar error boundary caught:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-zinc-800 bg-zinc-900/50">
          <span className="text-xs text-zinc-500">Failed to load 3D structure</span>
          <Button
            variant="outline"
            size="sm"
            className="border-zinc-800 text-xs text-zinc-400"
            onClick={() => this.setState((s) => ({ hasError: false, retryCount: s.retryCount + 1 }))}
          >
            <RefreshCw className="mr-1.5 h-3 w-3" />
            Retry
          </Button>
        </div>
      );
    }

    // Keyed Fragment forces full child remount when retryCount changes
    return <Fragment key={this.state.retryCount}>{this.props.children}</Fragment>;
  }
}
