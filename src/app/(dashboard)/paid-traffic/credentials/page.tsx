"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { KeyRound } from "lucide-react";
import { DashboardLayout } from "@client/components/layout/dashboard-layout";
import { Separator } from "@client/components/ui/separator";
import { CredentialStatusCard } from "@client/components/paid-traffic/credentials/CredentialStatusCard";
import { MetaAdsForm } from "@client/components/paid-traffic/credentials/MetaAdsForm";
import { GoogleAdsForm } from "@client/components/paid-traffic/credentials/GoogleAdsForm";

interface CredentialSummary {
  id: string;
  platform: string;
  isValid: boolean;
  validatedAt: string | null;
}

export default function CredentialsPage() {
  const { data: session } = useSession();
  const [metaCredential, setMetaCredential] = useState<CredentialSummary | null>(null);
  const [googleCredential, setGoogleCredential] = useState<CredentialSummary | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [isPageLoading, setIsPageLoading] = useState(true);

  const loadCredentials = useCallback(async () => {
    setIsPageLoading(true);
    try {
      const res = await fetch("/api/paid-traffic/credentials");
      if (!res.ok) return;
      const data = (await res.json()) as CredentialSummary[];
      setMetaCredential(data.find((c) => c.platform === "meta") ?? null);
      setGoogleCredential(data.find((c) => c.platform === "google") ?? null);
    } catch {
      // silently fail — UI will show "not connected" state
    } finally {
      setIsPageLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session) {
      void loadCredentials();
    }
  }, [session, loadCredentials]);

  async function handleRemove(platform: "meta" | "google") {
    const setLoading = platform === "meta" ? setLoadingMeta : setLoadingGoogle;
    setLoading(true);
    try {
      const res = await fetch(`/api/paid-traffic/credentials/${platform}`, {
        method: "DELETE",
      });
      if (res.ok || res.status === 204) {
        await loadCredentials();
      }
    } finally {
      setLoading(false);
    }
  }

  if (!session) return null;

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="h-9 w-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
          <KeyRound className="h-5 w-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Credenciais</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Conecte suas contas de anúncios para habilitar o tráfego pago com IA.
          </p>
        </div>
      </div>

      <Separator className="my-6" />

      {isPageLoading ? (
        <div className="flex items-center justify-center h-48">
          <div className="h-7 w-7 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      ) : (
        <div className="space-y-8">
          {/* Meta Ads */}
          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-3">Meta Ads</h2>
            <div className="space-y-4">
              <CredentialStatusCard
                platform="meta"
                isConnected={metaCredential?.isValid ?? false}
                validatedAt={
                  metaCredential?.validatedAt ? new Date(metaCredential.validatedAt) : null
                }
                onRemove={() => void handleRemove("meta")}
                isRemoving={loadingMeta}
              />
              {!metaCredential?.isValid && (
                <MetaAdsForm onSuccess={() => void loadCredentials()} />
              )}
            </div>
          </section>

          <Separator />

          {/* Google Ads */}
          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-3">Google Ads</h2>
            <div className="space-y-4">
              <CredentialStatusCard
                platform="google"
                isConnected={googleCredential?.isValid ?? false}
                validatedAt={
                  googleCredential?.validatedAt
                    ? new Date(googleCredential.validatedAt)
                    : null
                }
                onRemove={() => void handleRemove("google")}
                isRemoving={loadingGoogle}
              />
              {!googleCredential?.isValid && (
                <GoogleAdsForm onSuccess={() => void loadCredentials()} />
              )}
            </div>
          </section>
        </div>
      )}
    </DashboardLayout>
  );
}
