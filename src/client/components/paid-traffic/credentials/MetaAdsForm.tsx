"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@client/components/ui/card";
import { Button } from "@client/components/ui/button";
import { Input } from "@client/components/ui/input";
import { Label } from "@client/components/ui/label";

interface MetaAdsFormProps {
  onSuccess: () => void;
}

export function MetaAdsForm({ onSuccess }: MetaAdsFormProps) {
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [adAccountId, setAdAccountId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch("/api/paid-traffic/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: "meta",
          appId,
          appSecret,
          accessToken,
          adAccountId,
        }),
      });

      const data = (await res.json()) as { error?: string };

      if (!res.ok) {
        setError(data.error ?? "Erro ao conectar Meta Ads. Tente novamente.");
        return;
      }

      onSuccess();
    } catch {
      setError("Erro de conexão. Verifique sua internet e tente novamente.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Configurar Meta Ads</CardTitle>
        <p className="text-sm text-gray-500">
          Insira as credenciais do seu aplicativo no Meta Business Suite.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="meta-app-id">App ID</Label>
            <Input
              id="meta-app-id"
              placeholder="123456789012345"
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
              required
              disabled={isLoading}
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="meta-app-secret">App Secret</Label>
            <Input
              id="meta-app-secret"
              type="password"
              placeholder="••••••••••••••••"
              value={appSecret}
              onChange={(e) => setAppSecret(e.target.value)}
              required
              disabled={isLoading}
              autoComplete="new-password"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="meta-access-token">Access Token</Label>
            <Input
              id="meta-access-token"
              type="password"
              placeholder="••••••••••••••••"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              required
              disabled={isLoading}
              autoComplete="new-password"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="meta-ad-account-id">Ad Account ID</Label>
            <Input
              id="meta-ad-account-id"
              placeholder="act_123456789"
              value={adAccountId}
              onChange={(e) => setAdAccountId(e.target.value)}
              required
              disabled={isLoading}
              autoComplete="off"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {isLoading && (
            <p className="text-xs text-gray-500 text-center">
              Validando credenciais (pode levar até 10 segundos)…
            </p>
          )}

          <Button
            type="submit"
            variant="default"
            className="w-full"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Conectando…
              </>
            ) : (
              "Conectar Meta Ads"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
