"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
} from "lucide-react";
import { cn } from "@server/lib/utils";
import { Button } from "@client/components/ui/button";
import { Separator } from "@client/components/ui/separator";
import { Logo } from "@client/components/ui/logo";

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

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <aside className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-gray-100 bg-white">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 px-4 border-b border-gray-100">
        <Logo size="sm" />
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
