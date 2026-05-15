"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Loader2, X, Info } from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SocialAccount {
  id: string;
  platform: string;
  profileName: string | null;
  connected: boolean;
}

const PLATFORMS = [
  {
    id: "instagram",
    name: "Instagram",
    gradient: "from-purple-500 via-pink-500 to-orange-400",
    description: "Posts no feed, reels e stories",
    hint: "Use o Meta Business Suite para gerar um Page Access Token.",
  },
  {
    id: "facebook",
    name: "Facebook",
    gradient: "from-blue-700 to-blue-500",
    description: "Posts na página e grupos",
    hint: "Registre um app no Meta for Developers e obtenha o Page Access Token.",
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    gradient: "from-blue-800 to-blue-600",
    description: "Posts profissionais e artigos",
    hint: "Registre um app no LinkedIn Developers e obtenha o OAuth 2.0 token.",
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    gradient: "from-green-600 to-green-400",
    description: "Status e mensagens broadcast",
    hint: "Configure via WhatsApp Business API no Meta for Developers.",
  },
];

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
        .then((data) => { if (data?.socialAccounts) setAccounts(data.socialAccounts); });
    }
  }, [session]);

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
      const account = await res.json();
      setAccounts((prev) => [...prev.filter((a) => a.platform !== platform), account]);
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {PLATFORMS.map((platform) => {
          const account = accounts.find((a) => a.platform === platform.id && a.connected);
          const isDisconnecting = disconnecting === platform.id;

          return (
            <Card key={platform.id} className={account ? "border-green-200 bg-green-50/30" : ""}>
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${platform.gradient} text-white font-bold text-lg shadow-sm`}>
                    {platform.name[0]}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="font-semibold text-gray-900">{platform.name}</h3>
                      {account ? (
                        <Badge variant="success" className="gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Conectado
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Desconectado</Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-500">{platform.description}</p>
                    {account?.profileName && (
                      <p className="text-xs text-green-600 mt-1 font-medium">@{account.profileName}</p>
                    )}
                  </div>

                  {/* Action */}
                  {account ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => disconnect(platform.id)}
                      disabled={isDisconnecting}
                      className="shrink-0 text-red-500 border-red-200 hover:bg-red-50 hover:text-red-600"
                    >
                      {isDisconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                      Desconectar
                    </Button>
                  ) : (
                    <Button
                      variant="gradient"
                      size="sm"
                      onClick={() => setModal(platform.id)}
                      className="shrink-0"
                    >
                      Conectar
                    </Button>
                  )}
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
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Connect modal */}
      {modal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={closeModal}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">
                Conectar {PLATFORMS.find((p) => p.id === modal)?.name}
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
