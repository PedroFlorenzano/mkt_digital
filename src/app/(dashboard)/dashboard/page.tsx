"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  PlusSquare,
  Calendar,
  FileText,
  DollarSign,
  Share2,
  Settings,
  TrendingUp,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  FolderOpen,
} from "lucide-react";
import { DashboardLayout } from "@client/components/layout/dashboard-layout";
import { Button } from "@client/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@client/components/ui/card";
import { Badge } from "@client/components/ui/badge";
import { Input } from "@client/components/ui/input";

interface Company {
  id: string;
  name: string;
  description: string | null;
  sector: string | null;
  tone: string;
  colors: string[] | null;
  logoUrl: string | null;
  driveUrl: string | null;
  socialAccounts: { platform: string; connected: boolean; profileName: string | null }[];
}

const toneLabels: Record<string, string> = {
  professional: "Profissional",
  funny: "Engraçado",
  informative: "Informativo",
  inspirational: "Inspiracional",
};

const quickActions = [
  { href: "/create-post", label: "Criar post com IA", icon: PlusSquare, color: "blue", description: "Gere texto e imagem" },
  { href: "/schedule", label: "Agendar publicação", icon: Calendar, color: "purple", description: "Calendário de posts" },
  { href: "/posts", label: "Ver meus posts", icon: FileText, color: "green", description: "Rascunhos e publicados" },
  { href: "/costs", label: "Custos de IA", icon: DollarSign, color: "orange", description: "Tokens e gastos" },
  { href: "/social", label: "Redes sociais", icon: Share2, color: "pink", description: "Conectar contas" },
  { href: "/onboarding", label: "Configurações", icon: Settings, color: "gray", description: "Empresa e identidade" },
];

const colorMap: Record<string, string> = {
  blue: "bg-blue-50 text-blue-600",
  purple: "bg-purple-50 text-purple-600",
  green: "bg-green-50 text-green-600",
  orange: "bg-orange-50 text-orange-600",
  pink: "bg-pink-50 text-pink-600",
  gray: "bg-gray-100 text-gray-600",
};

const platforms = ["instagram", "facebook", "linkedin", "whatsapp"];

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [company, setCompany] = useState<Company | null>(null);
  const [driveUrl, setDriveUrl] = useState("");
  const [savingDrive, setSavingDrive] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (session) {
      fetch("/api/company")
        .then((r) => r.json())
        .then((data) => {
          if (!data?.id) router.push("/onboarding");
          else {
            setCompany(data);
            setDriveUrl(data.driveUrl ?? "");
          }
        });
    }
  }, [session, router]);

  if (status === "loading" || !company) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
            <p className="text-sm text-gray-500">Carregando...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const connectedCount = company.socialAccounts?.filter((a) => a.connected).length ?? 0;

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Olá, {session?.user?.name?.split(" ")[0]}! 👋
            </h1>
            <p className="text-gray-500 mt-1">
              Gerencie o marketing digital de <span className="font-medium text-gray-700">{company.name}</span>
            </p>
          </div>
          <Button variant="gradient" asChild>
            <Link href="/create-post">
              <Sparkles className="h-4 w-4" />
              Criar post com IA
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {/* Company card */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              {company.logoUrl ? (
                <div className="relative h-12 w-12 shrink-0 rounded-xl border border-gray-100 bg-gray-50 overflow-hidden">
                  <Image src={company.logoUrl} alt="Logo" fill sizes="48px" className="object-contain p-1" unoptimized />
                </div>
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 text-white font-bold text-lg">
                  {company.name.charAt(0)}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Empresa</p>
                <p className="font-semibold text-gray-900 truncate">{company.name}</p>
                <p className="text-xs text-gray-500">{company.sector}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tone card */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-purple-50">
                <TrendingUp className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Tom de voz</p>
                <p className="font-semibold text-gray-900">{toneLabels[company.tone] ?? company.tone}</p>
                <Badge variant="purple" className="mt-1 text-xs">Ativo</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Social card */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-green-50">
                <Share2 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Redes conectadas</p>
                <p className="font-semibold text-gray-900">{connectedCount} de {platforms.length}</p>
                {connectedCount === 0 && (
                  <Link href="/social" className="text-xs text-blue-600 hover:underline">Conectar agora</Link>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick actions */}
      <div className="mb-8">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Ações rápidas</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.href}
                href={action.href}
                className="group flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm hover:shadow-md hover:border-gray-200 hover:-translate-y-0.5 transition-all duration-150"
              >
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${colorMap[action.color]}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{action.label}</p>
                  <p className="text-xs text-gray-400 truncate">{action.description}</p>
                </div>
                <ArrowRight className="ml-auto h-3.5 w-3.5 text-gray-300 group-hover:text-gray-500 shrink-0 transition-colors" />
              </Link>
            );
          })}
        </div>
      </div>

      {/* Social accounts status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Status das redes sociais</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {platforms.map((platform) => {
              const account = company.socialAccounts?.find((a) => a.platform === platform);
              const isConnected = account?.connected;
              return (
                <div key={platform} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-3">
                    {isConnected ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <Clock className="h-4 w-4 text-gray-300" />
                    )}
                    <span className="text-sm font-medium text-gray-700 capitalize">{platform}</span>
                    {account?.profileName && (
                      <span className="text-xs text-gray-400">@{account.profileName}</span>
                    )}
                  </div>
                  {isConnected ? (
                    <Badge variant="success">Conectado</Badge>
                  ) : (
                    <Button variant="outline" size="sm" asChild>
                      <Link href="/social">Conectar</Link>
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Drive compartilhado */}
      <Card className="mt-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FolderOpen className="h-4 w-4" />
            Drive Compartilhado
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Input
              placeholder="Cole aqui o link do Drive compartilhado"
              value={driveUrl}
              onChange={(e) => setDriveUrl(e.target.value)}
              className="flex-1"
            />
            <Button
              variant="outline"
              size="sm"
              disabled={savingDrive}
              onClick={async () => {
                setSavingDrive(true);
                await fetch("/api/company", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ driveUrl }),
                });
                setSavingDrive(false);
              }}
            >
              {savingDrive ? "Salvando..." : "Salvar"}
            </Button>
            {driveUrl && (
              <Button
                variant="gradient"
                size="sm"
                onClick={() => window.open(driveUrl, "_blank")}
              >
                <ExternalLink className="h-4 w-4" />
                Abrir Drive
              </Button>
            )}
          </div>
          {driveUrl && (
            <p className="text-xs text-gray-400 mt-2 truncate">
              {driveUrl}
            </p>
          )}
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
