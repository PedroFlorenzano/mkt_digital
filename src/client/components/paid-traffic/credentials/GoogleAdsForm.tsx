"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@client/components/ui/card";
import { Button } from "@client/components/ui/button";
import { Input } from "@client/components/ui/input";
import { Label } from "@client/components/ui/label";

interface GoogleAdsFormProps {
  onSuccess: () => void;
}

export function GoogleAdsForm({ onSuccess }: GoogleAdsFormProps) {
  const [developerToken, setDeveloperToken] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [customerId, setCustomerId] = useState("");
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
          platform: "google",
          developerToken,
          clientId,
          clientSecret,
          refreshToken,
          customerId,
        }),
      });

      const data = (await res.json()) as { error?: string };

      if (!res.ok) {
        setError(data.error ?? "Erro ao conectar Google Ads. Tente novamente.");
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
        <CardTitle className="text-base">Configurar Google Ads</CardTitle>
        <p className="text-sm text-gray-500">
          Insira as credenciais da sua conta no Google Ads API.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="google-developer-token">Developer Token</Label>
            <Input
              id="google-developer-token"
              type="password"
              placeholder="••••••••••••••••"
              value={developerToken}
              onChange={(e) => setDeveloperToken(e.target.value)}
              required
              disabled={isLoading}
              autoComplete="new-password"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="google-client-id">Client ID</Label>
            <Input
              id="google-client-id"
              placeholder="123456789-abc.apps.googleusercontent.com"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              required
              disabled={isLoading}
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="google-client-secret">Client Secret</Label>
            <Input
              id="google-client-secret"
              type="password"
              placeholder="••••••••••••••••"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              required
              disabled={isLoading}
              autoComplete="new-password"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="google-refresh-token">Refresh Token</Label>
            <Input
              id="google-refresh-token"
              type="password"
              placeholder="••••••••••••••••"
              value={refreshToken}
              onChange={(e) => setRefreshToken(e.target.value)}
              required
              disabled={isLoading}
              autoComplete="new-password"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="google-customer-id">Customer ID</Label>
            <Input
              id="google-customer-id"
              placeholder="123-456-7890"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
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
              "Conectar Google Ads"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
