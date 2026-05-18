"use client";

import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@client/components/ui/button";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Catches unhandled render errors in the dashboard and shows a recovery UI
 * instead of crashing the entire page.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary] Uncaught render error:", error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center p-8">
          <div className="flex max-w-md flex-col items-center gap-4 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Algo deu errado</h2>
              <p className="mt-1 text-sm text-gray-500">
                Ocorreu um erro inesperado nesta página. Você pode tentar recarregar.
              </p>
              {this.state.error && (
                <p className="mt-2 rounded bg-gray-100 px-3 py-2 font-mono text-xs text-gray-600">
                  {this.state.error.message}
                </p>
              )}
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={this.handleReset}>
                <RefreshCw className="h-4 w-4" />
                Tentar novamente
              </Button>
              <Button variant="default" onClick={() => window.location.reload()}>
                Recarregar página
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
