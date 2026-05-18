"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useSession } from "next-auth/react";
import type { CompanyContextValue, CompanyFull } from "@/types/company";

// ─────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────

const CompanyContext = createContext<CompanyContextValue | null>(null);

// ─────────────────────────────────────────────
// Helper — parse colors field (may arrive as JSON string)
// ─────────────────────────────────────────────

function parseColors(colors: unknown): string[] {
  if (typeof colors === "string") {
    try {
      const parsed: unknown = JSON.parse(colors);
      if (Array.isArray(parsed)) {
        return parsed.filter((c): c is string => typeof c === "string");
      }
    } catch {
      // not valid JSON — ignore
    }
  }
  if (Array.isArray(colors)) {
    return colors.filter((c): c is string => typeof c === "string");
  }
  return [];
}

// ─────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────

interface CompanyProviderProps {
  children: React.ReactNode;
}

export function CompanyProvider({ children }: CompanyProviderProps) {
  const { data: session } = useSession();
  const activeCompanyId = session?.user?.activeCompanyId ?? null;

  const [company, setCompany] = useState<CompanyFull | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCompany = useCallback(async () => {
    if (!activeCompanyId) {
      setCompany(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/company");

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        let message = `Erro ao carregar empresa (HTTP ${response.status})`;
        try {
          const json = JSON.parse(text) as { error?: string };
          if (json.error) message = json.error;
        } catch {
          // ignore parse error
        }
        setError(message);
        setCompany(null);
        return;
      }

      const data: unknown = await response.json();

      if (data === null || data === undefined) {
        setCompany(null);
        return;
      }

      const raw = data as Record<string, unknown>;

      const companyFull: CompanyFull = {
        id: typeof raw["id"] === "string" ? raw["id"] : "",
        name: typeof raw["name"] === "string" ? raw["name"] : "",
        sector: typeof raw["sector"] === "string" ? raw["sector"] : null,
        logoUrl: typeof raw["logoUrl"] === "string" ? raw["logoUrl"] : null,
        description:
          typeof raw["description"] === "string" ? raw["description"] : null,
        objective:
          typeof raw["objective"] === "string" ? raw["objective"] : null,
        tone: typeof raw["tone"] === "string" ? raw["tone"] : "",
        colors: parseColors(raw["colors"]),
        socialAccounts: Array.isArray(raw["socialAccounts"])
          ? (raw["socialAccounts"] as Array<Record<string, unknown>>).map(
              (sa) => ({
                platform:
                  typeof sa["platform"] === "string" ? sa["platform"] : "",
                connected:
                  typeof sa["connected"] === "boolean" ? sa["connected"] : false,
                profileName:
                  typeof sa["profileName"] === "string"
                    ? sa["profileName"]
                    : null,
              })
            )
          : [],
        createdAt:
          typeof raw["createdAt"] === "string" ? raw["createdAt"] : "",
      };

      setCompany(companyFull);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro desconhecido ao carregar empresa";
      setError(message);
      setCompany(null);
    } finally {
      setIsLoading(false);
    }
  }, [activeCompanyId]);

  useEffect(() => {
    void fetchCompany();
  }, [fetchCompany]);

  const refresh = useCallback(async () => {
    await fetchCompany();
  }, [fetchCompany]);

  const value: CompanyContextValue = {
    company,
    isLoading,
    error,
    refresh,
  };

  return (
    <CompanyContext.Provider value={value}>
      {children}
    </CompanyContext.Provider>
  );
}

// ─────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────

/**
 * Consumes the CompanyContext.
 * Throws if used outside of a <CompanyProvider>.
 */
export function useActiveCompany(): CompanyContextValue {
  const ctx = useContext(CompanyContext);
  if (ctx === null) {
    throw new Error(
      "useActiveCompany must be used within a <CompanyProvider>. " +
        "Make sure the component is wrapped inside CompanyProvider."
    );
  }
  return ctx;
}

export { CompanyContext };
