"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Loader2, X, Info, AlertTriangle, Clock, ChevronDown, ChevronUp } from "lucide-react";
import { DashboardLayout } from "@client/components/layout/dashboard-layout";
import { Button } from "@client/components/ui/button";
import { Badge } from "@client/components/ui/badge";
import { Card, CardContent } from "@client/components/ui/card";
import { Input } from "@client/components/ui/input";
import { Label } from "@client/components/ui/label";
import { Separator } from "@client/components/ui/separator";
import { BioGenerator } from "@client/components/BioGenerator";
import { FeedGridPlanner } from "@client/components/FeedGridPlanner";
import { ProfileAuditor } from "@client/components/ProfileAuditor";

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
    tokenTtlDays: 60,
    tokenLabel: "Page Access Token",
    profileIdLabel: "ID do perfil Instagram",
    profileIdPlaceholder: "Ex: 123456789012345",
    steps: [
      "Acesse business.facebook.com e vá em Configurações > Contas > Contas do Instagram",
      "Vincule sua conta do Instagram à sua Página do Facebook",
      "Em Meta for Developers, crie um app com produto Instagram Graph API",
      "Solicite as permissões: instagram_basic, instagram_content_publish, pages_read_engagement",
      "Gere um Page Access Token de longa duração (válido por 60 dias) via Graph API Explorer",
      "O ID do perfil é o Instagram Account ID — obtenha com: GET /me?fields=instagram_business_account",
    ],
    warning: null,
  },
  {
    id: "facebook",
    name: "Facebook",
    gradient: "from-blue-700 to-blue-500",
    description: "Posts na página e grupos",
    tokenTtlDays: 60,
    tokenLabel: "Page Access Token",
    profileIdLabel: "ID da Página do Facebook",
    profileIdPlaceholder: "Ex: 123456789012345",
    steps: [
      "Acesse Meta for Developers (developers.facebook.com) e crie um app",
      "Adicione o produto Facebook Login e Pages API",
      "Solicite as permissões: pages_manage_posts, pages_read_engagement",
      "No Graph API Explorer, selecione sua Página e gere um Page Access Token",
      "Converta para token de longa duração: GET /oauth/access_token?grant_type=fb_exchange_token",
      "O ID da página está na URL da sua Página do Facebook ou em Configurações > Sobre",
    ],
    warning: null,
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    gradient: "from-blue-800 to-blue-600",
    description: "Posts profissionais e artigos",
    tokenTtlDays: 60,
    tokenLabel: "OAuth 2.0 Access Token",
    profileIdLabel: "URN do perfil (person ou organization)",
    profileIdPlaceholder: "Ex: urn:li:person:ABC123 ou urn:li:organization:123",
    steps: [
      "Acesse developer.linkedin.com e crie um app na sua empresa",
      "Solicite acesso ao produto Share on LinkedIn e Community Management API",
      "Configure a URL de redirecionamento OAuth no app",
      "Solicite as permissões (scopes): w_member_social, r_liteprofile",
      "Implemente o fluxo OAuth 2.0 ou use o LinkedIn Token Generator para testes",
      "Para obter o URN: GET https://api.linkedin.com/v2/userinfo com seu token",
    ],
    warning: "Tokens do LinkedIn expiram em 60 dias e não podem ser renovados automaticamente — é necessário refazer o fluxo OAuth.",
  },
  {
    id: "tiktok",
    name: "TikTok",
    gradient: "from-gray-900 via-gray-800 to-gray-700",
    description: "Vídeos e carrosséis de fotos",
    tokenTtlDays: 30,
    tokenLabel: "Access Token OAuth 2.0",
    profileIdLabel: "Open ID do usuário TikTok",
    profileIdPlaceholder: "Ex: _000abc123xyz",
    steps: [
      "Acesse developers.tiktok.com e crie uma conta de desenvolvedor",
      "Crie um novo app e adicione o produto Content Posting API",
      "Habilite a opção Direct Post nas configurações do produto",
      "Solicite os escopos: video.publish, video.upload, user.info.basic",
      "Submeta o app para revisão — o TikTok pode levar de 3 dias a 2 semanas para aprovar",
      "Após aprovação, implemente o fluxo OAuth 2.0 para obter o Access Token do usuário",
      "O Open ID é retornado durante o fluxo OAuth em /v2/oauth/token/",
    ],
    warning: "⚠️ Sem aprovação do TikTok, os posts são publicados em modo PRIVADO automaticamente. A revisão é obrigatória para publicar publicamente.",
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    gradient: "from-green-600 to-green-400",
    description: "Mensagens broadcast (não Status)",
    tokenTtlDays: 60,
    tokenLabel: "System User Access Token",
    profileIdLabel: "Phone Number ID",
    profileIdPlaceholder: "Ex: 123456789012345",
    steps: [
      "Acesse Meta for Developers e crie um app com produto WhatsApp Business",
      "Configure um número de telefone para o WhatsApp Business API",
      "Crie um System User em Configurações de Negócios > System Users",
      "Gere um System User Access Token com a permissão whatsapp_business_messaging",
      "O Phone Number ID está em WhatsApp > Getting Started no painel do app",
      "Adicione destinatários ao modo Sandbox para testes antes de ir para produção",
    ],
    warning: "⚠️ A API do WhatsApp envia mensagens broadcast para contatos cadastrados. Não é possível publicar no Status do WhatsApp via API — apenas pelo app.",
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

  // Instagram management collapsible sections
  const [showBioGenerator, setShowBioGenerator] = useState(false);
  const [showFeedPlanner, setShowFeedPlanner] = useState(false);
  const [showProfileAuditor, setShowProfileAuditor] = useState(false);

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

      {/* ── Instagram management tools ── */}
      <Separator className="my-6" />

      <div className="space-y-3 mb-8">
        {/* Bio Generator */}
        <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
          <button
            type="button"
            className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
            onClick={() => setShowBioGenerator((v) => !v)}
          >
            <span className="font-semibold text-gray-900 text-sm">Sugestão de Bio com IA</span>
            {showBioGenerator ? <ChevronUp className="h-4 w-4 text-gray-500" /> : <ChevronDown className="h-4 w-4 text-gray-500" />}
          </button>
          {showBioGenerator && (
            <div className="px-5 pb-5">
              <BioGenerator />
            </div>
          )}
        </div>

        {/* Feed Grid Planner */}
        <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
          <button
            type="button"
            className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
            onClick={() => setShowFeedPlanner((v) => !v)}
          >
            <span className="font-semibold text-gray-900 text-sm">Planejador de Feed 3×3</span>
            {showFeedPlanner ? <ChevronUp className="h-4 w-4 text-gray-500" /> : <ChevronDown className="h-4 w-4 text-gray-500" />}
          </button>
          {showFeedPlanner && (
            <div className="px-5 pb-5">
              <FeedGridPlanner />
            </div>
          )}
        </div>

        {/* Profile Auditor */}
        <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
          <button
            type="button"
            className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
            onClick={() => setShowProfileAuditor((v) => !v)}
          >
            <span className="font-semibold text-gray-900 text-sm">Auditoria de Perfil</span>
            {showProfileAuditor ? <ChevronUp className="h-4 w-4 text-gray-500" /> : <ChevronDown className="h-4 w-4 text-gray-500" />}
          </button>
          {showProfileAuditor && (
            <div className="px-5 pb-5">
              <ProfileAuditor />
            </div>
          )}
        </div>
      </div>

      {/* Info box — pré-requisitos por plataforma */}
      <Card className="border-blue-100 bg-blue-50/50">
        <CardContent className="p-5">
          <div className="flex gap-3">
            <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="w-full">
              <p className="text-sm font-medium text-blue-900 mb-4">
                Como obter as credenciais de cada plataforma
              </p>
              <div className="space-y-5">
                {PLATFORMS.map((p) => (
                  <div key={p.id}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`h-5 w-5 rounded flex items-center justify-center bg-gradient-to-br ${p.gradient} text-white text-xs font-bold shrink-0`}>
                        {p.name[0]}
                      </div>
                      <p className="text-xs font-semibold text-gray-800">{p.name}</p>
                      <span className="text-xs text-gray-400">— token expira em ~{p.tokenTtlDays} dias</span>
                    </div>
                    <ol className="space-y-1 pl-4">
                      {p.steps.map((step, i) => (
                        <li key={i} className="text-xs text-blue-700 flex gap-2">
                          <span className="text-blue-400 shrink-0 font-medium">{i + 1}.</span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                    {p.warning && (
                      <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-1.5">
                        {p.warning}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Connect / Renew modal */}
      {modal && (() => {
        const platformConfig = PLATFORMS.find((p) => p.id === modal);
        const isRenewing = accounts.find((a) => a.platform === modal && a.connected);
        return (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={closeModal}>
            <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between p-6 border-b border-gray-100">
                <h3 className="text-lg font-semibold text-gray-900">
                  {isRenewing
                    ? `Renovar token — ${platformConfig?.name}`
                    : `Conectar ${platformConfig?.name}`}
                </h3>
                <button onClick={closeModal} className="p-1.5 rounded-lg hover:bg-gray-100">
                  <X className="h-4 w-4 text-gray-500" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                {/* Platform warning */}
                {platformConfig?.warning && (
                  <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700 leading-relaxed">{platformConfig.warning}</p>
                  </div>
                )}

                {/* Steps accordion */}
                {platformConfig?.steps && (
                  <details className="group rounded-lg border border-gray-200 overflow-hidden">
                    <summary className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 text-sm font-medium text-gray-700 list-none">
                      <span className="flex items-center gap-2">
                        <Info className="h-4 w-4 text-blue-500" />
                        Como obter as credenciais do {platformConfig.name}
                      </span>
                      <ChevronDown className="h-4 w-4 text-gray-400 group-open:rotate-180 transition-transform" />
                    </summary>
                    <div className="px-4 pb-4 pt-1 border-t border-gray-100">
                      <ol className="space-y-2">
                        {platformConfig.steps.map((step, i) => (
                          <li key={i} className="text-xs text-gray-600 flex gap-2.5">
                            <span className="flex-shrink-0 h-5 w-5 rounded-full bg-blue-100 text-blue-700 font-semibold flex items-center justify-center text-xs">
                              {i + 1}
                            </span>
                            <span className="leading-relaxed">{step}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  </details>
                )}

                {/* Form fields */}
                <div className="space-y-1.5">
                  <Label>{platformConfig?.tokenLabel ?? "Access Token"} *</Label>
                  <Input
                    type="password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="Cole seu token de acesso aqui"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>{platformConfig?.profileIdLabel ?? "ID do Perfil"} *</Label>
                  <Input
                    value={profileId}
                    onChange={(e) => setProfileId(e.target.value)}
                    placeholder={platformConfig?.profileIdPlaceholder ?? "Ex: 123456789"}
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
        );
      })()}
    </DashboardLayout>
  );
}
