"use client";

import { CheckCircle2, XCircle, Loader2, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@client/components/ui/card";
import { Badge } from "@client/components/ui/badge";
import { Button } from "@client/components/ui/button";

interface CredentialStatusCardProps {
  platform: "meta" | "google";
  isConnected: boolean;
  validatedAt?: Date | null;
  onRemove: () => void;
  isRemoving?: boolean;
}

const platformConfig = {
  meta: { label: "Meta Ads", description: "Facebook & Instagram Ads" },
  google: { label: "Google Ads", description: "Google Search & Display" },
} as const;

export function CredentialStatusCard({
  platform,
  isConnected,
  validatedAt,
  onRemove,
  isRemoving = false,
}: CredentialStatusCardProps) {
  const config = platformConfig[platform];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base">{config.label}</CardTitle>
            <p className="text-sm text-gray-500 mt-0.5">{config.description}</p>
          </div>
          <Badge variant={isConnected ? "success" : "destructive"} className="gap-1.5 shrink-0">
            {isConnected ? (
              <>
                <CheckCircle2 className="h-3 w-3" />
                Conectado
              </>
            ) : (
              <>
                <XCircle className="h-3 w-3" />
                Desconectado
              </>
            )}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div>
            {isConnected && validatedAt ? (
              <p className="text-xs text-gray-500">
                Validado em{" "}
                {new Date(validatedAt).toLocaleString("pt-BR", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            ) : (
              <p className="text-xs text-gray-400">Nenhuma credencial configurada</p>
            )}
          </div>
          {isConnected && (
            <Button
              variant="ghost"
              size="sm"
              className="text-red-500 hover:text-red-600 hover:bg-red-50 gap-1.5"
              onClick={onRemove}
              disabled={isRemoving}
              aria-label={`Remover credencial ${config.label}`}
            >
              {isRemoving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              Remover
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
