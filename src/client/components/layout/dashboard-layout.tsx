"use client";

import React from "react";
import { Sidebar } from "./sidebar";
import { CompanyProvider } from "@client/components/company/CompanyContext";
import { ErrorBoundary } from "@client/components/ui/error-boundary";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <CompanyProvider>
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar />
        <main className="flex-1 ml-64 min-h-screen">
          <div className="max-w-6xl mx-auto px-6 py-8">
            <ErrorBoundary>
              {children}
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </CompanyProvider>
  );
}
