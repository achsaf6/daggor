"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  surface: string;
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

// Catches uncaught render errors anywhere below it. Without this, a single
// thrown error (image load fallback misconfigured, null-deref in a component,
// etc.) leaves React in a frozen state and the LoadingScreen stays up
// indefinitely with no diagnostic — that's how the theatrical-vignette CSS
// bug went undetected for so long.
//
// Class component is required: hooks can't catch render errors.
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[Daggor] Uncaught render error", { error, componentStack: info.componentStack });
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[#120303] p-6 text-center">
          <div className="relative z-10 max-w-md space-y-4 text-foreground">
            <p className="text-[11px] uppercase tracking-[0.4em] text-muted-foreground">
              Daggor &mdash; {this.props.surface}
            </p>
            <p className="text-2xl font-bold tracking-tight text-destructive">
              The realm collapsed.
            </p>
            <p className="text-sm text-muted-foreground">
              {this.state.error.message || "An uncaught render error occurred."}
            </p>
            <p className="text-xs text-muted-foreground/80 font-mono">
              Open the browser console for the component stack.
            </p>
            <div className="flex justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={this.reset}
                className="rounded-md bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wider text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-md border border-border px-4 py-2 text-xs font-semibold uppercase tracking-wider text-foreground transition-colors hover:bg-card"
              >
                Reload
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
