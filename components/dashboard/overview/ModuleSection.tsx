"use client";

/**
 * components/dashboard/overview/ModuleSection.tsx
 *
 * Client boundary wrapping an overview module with error boundary and suspense.
 * docs/design/dashboard-overview/02-module-contract.md §2.
 */

import React, { Component, Suspense } from "react";
import { EmptyState } from "./EmptyState";

interface ErrorBoundaryProps {
  fallbackTitle: string;
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class SectionErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[SectionErrorBoundary] caught:", error, errorInfo);
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      return (
        <EmptyState
          variant="blocked"
          title={this.props.fallbackTitle}
          description="A temporary error occurred loading this section."
          action={{
            label: "Retry",
            onClick: this.handleRetry,
          }}
        />
      );
    }

    return this.props.children;
  }
}

export interface ModuleSectionProps {
  title?: string;
  errorTitle?: string;
  skeleton?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function ModuleSection({
  title,
  errorTitle = "Could not load this section",
  skeleton,
  children,
  className = "",
}: ModuleSectionProps) {
  const defaultSkeleton = (
    <div className="min-h-[140px] rounded-xl border border-zinc-200/80 bg-white p-4 space-y-3 animate-pulse">
      <div className="h-4 w-32 bg-zinc-200 rounded" />
      <div className="h-10 w-full bg-zinc-100 rounded" />
      <div className="h-4 w-48 bg-zinc-100 rounded" />
    </div>
  );

  return (
    <section className={`space-y-3 ${className}`}>
      {title && (
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-600">
            {title}
          </h2>
        </div>
      )}

      <SectionErrorBoundary fallbackTitle={errorTitle}>
        <Suspense fallback={skeleton || defaultSkeleton}>
          {children}
        </Suspense>
      </SectionErrorBoundary>
    </section>
  );
}
