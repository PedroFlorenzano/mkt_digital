"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Loader2, X, Info, AlertTriangle, Clock } from "lucide-react";
import { DashboardLayout } from "@client/components/layout/dashboard-layout";
import { Button } from "@client/components/ui/button";
import { Badge } from "@client/components/ui/badge";
import { Card, CardContent } from "@client/components/ui/card";
import { Input } from "@client/components/ui/input";
import { Label } from "@client/components/ui/label";

interface SocialAccount {
  id: string;
  platform: string;
  profileName: string | null;
  connected: boolean;
  /** ISO string — when the token was saved (used to estimate expiry) */
  updatedAt?: string;
}

const PLATFORMS = [
  {
    id: "instagram",
    name: "Instagram",
    gradient: "from-purple-500 via-pink-500 to-orange-400",
    description: "Posts no feed, reels e stories",
    hint: "Use o Meta Business Suite para gerar um Page Access Token com expiração longa (60 dias).",
    /** Meta long-lived tokens last 60 days */
    tokenTtlDays: 60,
  },
  {
    id: "facebook",
    name: "Facebook",
    gradient: "from-blue-700 to-blue-500",
    description: "Posts na página e grupos",
    hint: "Registre um app no Meta for Developers e obtenha o Page Access Token.",
    tokenTtlDays: 60,
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    gradient: "from-blue-800 to-blue-600",
    description: "Posts profissionais e artigos",
    hint: "Registre um app no LinkedIn Developers e obtenha o OAuth 2.0 token (válido por 60 dias).",
    tokenTtlDays: 60,
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    gradient: "from-green-600 to-green-400",
    description: "Status e mensagens broadcast",
    hint: "Configure via WhatsApp Business API no Meta for Developers.",
    tokenTtlDays: 60,
  },
];

/**
 * Returns the number of days until the token expires.
 * Returns null if we don't know when it was connected.
 */
function daysUntilExpiry(updatedAt: string | undefined, ttlDays: number): number | null {
  if (!updatedAt) return null;
  const connected = new Date(updatedAt).getTime();
  const expiry = connected + ttlDays * 24 * 60 * 60 * 1000;
  const remaining = Math.floor((expiry - Date.now()) / (24 * 60 * 60 * 1000));
  return remaining;
}

function TokenExpiryBadge({ daysLeft }: { daysLeft: number | null }) {
  if (daysLeft === null) return null;

  if (daysLeft <= 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
        <XCircle className="h-3 w-3" />
        Token expirado
      </span>
    );
  }
  if (daysLeft <= 7) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
        <AlertTriangle className="h-3 w-3" />
        Expira em {daysLeft}d
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
      <Clock className="h-3 w-3" />
      {daysLeft}d restantes
    </span>
  );
}

export default function SocialPage() {
  const { data: session } = useSession();
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [modal, setModal] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [profileId, setProfileId] = useState("");
  const [profileName, setProfileName] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (session) {
      fetch("/api/company")
        .then((r) => r.json())
        .then((data: { socialAccounts?: SocialAccount[] }) => {
          if (data?.socialAccounts) setAccounts(data.socialAccounts);
        });
    }
  }, [session]);

  // Accounts with tokens expiring within 7 days
  const expiringAccounts = accounts.filter((a) => {
    if (!a.connected) return false;
    const platform = PLATFORMS.find((p) => p.id === a.platform);
    if (!platform) return false;
    const days = daysUntilExpiry(a.updatedAt, platform.tokenTtlDays);
    return days !== null && days <= 7;
  });

  async function connect(platform: string) {
    if (!token || !profileId) { setError("Preencha o token e o ID do perfil."); return; }
    setConnecting(platform);
    setError("");

    const res = await fetch("/api/social/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform, accessToken: token, profileId, profileName: profileName || platform }),
    });

    if (res.ok) {
      const account = await res.json() as SocialAccount;
      setAccounts((prev) => [...prev.filter((a) => a.platform !== platform), { ...account, updatedAt: new Date().toISOString() }]);
      closeModal();
    } else {
      setError("Erro ao conectar. Verifique o token e tente novamente.");
    }
    setConnecting(null);
  }

  async function disconnect(platform: string) {
    setDisconnecting(platform);
    const res = await fetch(`/api/social/connect?platform=${platform}`, { method: "DELETE" });
    if (res.ok) setAccounts((prev) => prev.map((a) => a.platform === platform ? { ...a, connected: false } : a));
    setDisconnecting(null);
  }

  function closeModal() {
    setModal(null);
    setToken("");
    setProfileId("");
    setProfileName("");
    setError("");
  }

  if (!session) return null;

  const connectedCount = accounts.filter((a) => a.connected).length;

  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Redes Sociais</h1>
        <p className="text-gray-500 mt-1">
          {connectedCount} de {PLATFORMS.length} redes conectadas
        </p>
      </div>

      {/* ── Token expiry alert ── */}
      {expiringAccounts.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            <div>
              <p className="text-sm font-semibold text-amber-800">
                {expiringAccounts.length === 1
                  ? "Token expirando em breve"
                  : `${expiringAccounts.length} tokens expirando em breve`}
              </p>
              <p className="mt-0.5 text-xs text-amber-700">
                {expiringAccounts.map((a) => {
                  const p = PLATFORMS.find((pl) => pl.id === a.platform);
                  const days = daysUntilExpiry(a.updatedAt, p?.tokenTtlDays ?? 60);
                  if (days !== null && days <= 0) {
                    return `${p?.name ?? a.platform}: expirado — publicações podem estar falhando`;
                  }
                  return `${p?.name ?? a.platform}: expira em ${days}d`;
                }).join(" · ")}
              </p>
              <p className="mt-1 text-xs text-amber-600">
                Reconecte a rede social antes que o token expire para evitar falhas na publicação.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {PLATFORMS.map((platform) => {
          const account = accounts.find((a) => a.platform === platform.id && a.connected);
          const isDisconnecting = disconnecting === platform.id;
          const daysLeft = account ? daysUntilExpiry(account.updatedAt, platform.tokenTtlDays) : null;
          const isExpired = daysLeft !== null && daysLeft <= 0;

          return (
            <Card key={platform.id} className={account && !isExpired ? "border-green-200 bg-green-50/30" : isExpired ? "border-red-200 bg-red-50/20" : ""}>
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${platform.gradient} text-white font-bold text-lg shadow-sm`}>
                    {platform.name[0]}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <h3 className="font-semibold text-gray-900">{platform.name}</h3>
                      {account && !isExpired ? (
                        <Badge variant="success" className="gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Conectado
                        </Badge>
                      ) : isExpired ? (
                        <Badge variant="destructive" className="gap-1">
                          <XCircle className="h-3 w-3" />
                          Token expirado
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Desconectado</Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-500">{platform.description}</p>
                    {account?.profileName && (
                      <p className="text-xs text-green-600 mt-1 font-medium">@{account.profileName}</p>
                    )}
                    {account && (
                      <div className="mt-1.5">
                        <TokenExpiryBadge daysLeft={daysLeft} />
                      </div>
                    )}
                  </div>

                  {/* Action */}
                  <div className="flex flex-col gap-1.5 shrink-0">
                    {account && !isExpired ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setModal(platform.id)}
                          className="text-xs"
                        >
                          Renovar token
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => disconnect(platform.id)}
                          disabled={isDisconnecting}
                          className="text-red-500 border-red-200 hover:bg-red-50 hover:text-red-600 text-xs"
                        >
                          {isDisconnecting ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
                          Desconectar
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="gradient"
                        size="sm"
                        onClick={() => setModal(platform.id)}
                      >
                        {isExpired ? "Reconectar" : "Conectar"}
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Info box */}
      <Card className="border-blue-100 bg-blue-50/50">
        <CardContent className="p-5">
          <div className="flex gap-3">
            <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-blue-900 mb-2">Como obter os tokens de acesso?</p>
              <div className="space-y-1.5">
                {PLATFORMS.map((p) => (
                  <p key={p.id} className="text-xs text-blue-700">
                    <span className="font-medium">{p.name}:</span> {p.hint}
                  </p>
                ))}
              </div>
              <p className="mt-3 text-xs text-blue-600 font-medium">
                ⚠️ Tokens expiram em ~60 dias. Renove antes de vencer para não interromper a publicação automática.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Connect / Renew modal */}
      {modal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={closeModal}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">
                {accounts.find((a) => a.platform === modal && a.connected)
                  ? `Renovar token — ${PLATFORMS.find((p) => p.id === modal)?.name}`
                  : `Conectar ${PLATFORMS.find((p) => p.id === modal)?.name}`}
              </h3>
              <button onClick={closeModal} className="p-1.5 rounded-lg hover:bg-gray-100">
                <X className="h-4 w-4 text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <Label>Access Token *</Label>
                <Input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Cole seu token de acesso aqui"
                />
              </div>

              <div className="space-y-1.5">
                <Label>ID do Perfil / Página *</Label>
                <Input
                  value={profileId}
                  onChange={(e) => setProfileId(e.target.value)}
                  placeholder="Ex: 123456789"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Nome do perfil (opcional)</Label>
                <Input
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  placeholder="@meuperfil"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600">
                  <XCircle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1" onClick={closeModal}>Cancelar</Button>
                <Button
                  variant="gradient"
                  className="flex-1"
                  onClick={() => connect(modal)}
                  disabled={!token || !profileId || connecting === modal}
                >
                  {connecting === modal ? <><Loader2 className="h-4 w-4 animate-spin" />Conectando...</> : "Conectar"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
