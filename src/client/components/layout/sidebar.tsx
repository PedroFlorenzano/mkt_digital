"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  LayoutDashboard,
  PlusSquare,
  FileText,
  Calendar,
  Share2,
  DollarSign,
  TrendingUp,
  Video,
  Settings,
  LogOut,
  ChevronRight,
  ChevronsUpDown,
} from "lucide-react";
import { cn } from "@server/lib/utils";
import { Button } from "@client/components/ui/button";
import { Separator } from "@client/components/ui/separator";
import { Logo } from "@client/components/ui/logo";
import { useActiveCompany } from "@client/components/company/CompanyContext";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/create-post", label: "Criar Post", icon: PlusSquare },
  { href: "/posts", label: "Meus Posts", icon: FileText },
  { href: "/schedule", label: "Agendamento", icon: Calendar },
  { href: "/social", label: "Redes Sociais", icon: Share2 },
  { href: "/costs", label: "Custos de IA", icon: DollarSign },
  { href: "/paid-traffic", label: "Tráfego Pago", icon: TrendingUp },
  { href: "/video", label: "Vídeos com IA", icon: Video },
];

// ─── Deterministic avatar color from company name ────────────────────────────

const AVATAR_COLORS = [
  "bg-blue-500",
  "bg-indigo-500",
  "bg-violet-500",
  "bg-purple-500",
  "bg-pink-500",
  "bg-rose-500",
  "bg-orange-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-teal-500",
] as const;

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length] ?? "bg-blue-500";
}

// ─── Company Switcher ─────────────────────────────────────────────────────────

function CompanySwitcher() {
  const router = useRouter();
  const { company, isLoading } = useActiveCompany();

  const handleSwitch = () => {
    router.push("/company-selector");
  };

  // Loading skeleton
  if (isLoading) {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label="Carregando empresa…"
        className="mx-3 mb-2 flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5"
      >
        <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-gray-200" />
        <div className="flex flex-1 flex-col gap-1.5">
          <div className="h-3 w-2/3 animate-pulse rounded bg-gray-200" />
          <div className="h-2.5 w-1/3 animate-pulse rounded bg-gray-200" />
        </div>
      </div>
    );
  }

  // No company loaded
  if (!company) {
    return (
      <button
        type="button"
        onClick={handleSwitch}
        aria-label="Selecionar empresa"
        className="mx-3 mb-2 flex w-[calc(100%-1.5rem)] items-center gap-2 rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-2.5 text-left transition-all duration-150 hover:border-blue-300 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-semibold text-gray-500">
          ?
        </div>
        <span className="flex-1 text-sm font-medium text-gray-400">
          Selecionar empresa
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-gray-300" />
      </button>
    );
  }

  const displayName = company.name.slice(0, 200);
  const avatarLetter = displayName.charAt(0).toUpperCase();
  const avatarColor = getAvatarColor(company.name);

  return (
    <button
      type="button"
      onClick={handleSwitch}
      aria-label={`Empresa ativa: ${displayName}. Clique para trocar empresa`}
      className="mx-3 mb-2 flex w-[calc(100%-1.5rem)] items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5 text-left transition-all duration-150 hover:border-blue-200 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
    >
      {/* Logo or avatar */}
      <div className="shrink-0">
        {company.logoUrl ? (
          <img
            src={company.logoUrl}
            alt={`Logo de ${displayName}`}
            className="h-8 w-8 rounded-full object-cover"
          />
        ) : (
          <div
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white",
              avatarColor
            )}
            aria-hidden="true"
          >
            {avatarLetter}
          </div>
        )}
      </div>

      {/* Company name + action label */}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold text-gray-900">
          {displayName}
        </span>
        <span className="text-xs text-gray-400">Trocar empresa</span>
      </div>

      <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
    </button>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <aside className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-gray-100 bg-white">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 px-4 border-b border-gray-100">
        <Logo size="sm" />
      </div>

      {/* Company Switcher */}
      <div className="pt-3">
        <CompanySwitcher />
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
                isActive
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              )}
            >
              <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-blue-600" : "text-gray-400")} />
              {item.label}
              {isActive && <ChevronRight className="ml-auto h-3 w-3 text-blue-400" />}
            </Link>
          );
        })}
      </nav>

      <Separator />

      {/* Footer */}
      <div className="p-3 space-y-1">
        <Link
          href="/onboarding"
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-all duration-150"
        >
          <Settings className="h-4 w-4 text-gray-400" />
          Configurações
        </Link>

        <div className="flex items-center gap-3 rounded-lg px-3 py-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 text-xs font-semibold text-white">
            {session?.user?.name?.charAt(0)?.toUpperCase() ?? "U"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{session?.user?.name}</p>
            <p className="text-xs text-gray-400 truncate">{session?.user?.email}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="h-7 w-7 text-gray-400 hover:text-red-500"
            title="Sair"
          >
            <LogOut className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </aside>
  );
}
