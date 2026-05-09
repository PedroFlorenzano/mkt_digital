"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";

interface Company {
  id: string;
  name: string;
  description: string | null;
  sector: string | null;
  tone: string;
  colors: string[] | null;
  logoUrl: string | null;
  socialAccounts: { platform: string; connected: boolean; profileName: string | null }[];
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [company, setCompany] = useState<Company | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (session) {
      fetch("/api/company")
        .then((res) => res.json())
        .then((data) => {
          if (!data || !data.id) {
            router.push("/onboarding");
          } else {
            setCompany(data);
          }
        });
    }
  }, [session, router]);

  if (status === "loading" || !company) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-pulse text-gray-500">Carregando...</div>
      </div>
    );
  }

  const toneLabels: Record<string, string> = {
    professional: "Profissional",
    funny: "Engraçado",
    informative: "Informativo",
    inspirational: "Inspiracional",
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <h1 className="text-xl font-bold text-blue-600">MKT Digital</h1>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">{session?.user?.name}</span>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Sair
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900">
            Olá, {session?.user?.name?.split(" ")[0]}!
          </h2>
          <p className="text-gray-500 mt-1">
            Gerencie o marketing digital de {company.name}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-xl border border-gray-200">
            <h3 className="text-sm font-medium text-gray-500">Empresa</h3>
            <div className="flex items-center gap-4 mt-2">
              {company.logoUrl && (
                <div className="relative w-14 h-14 flex-shrink-0 rounded-lg border border-gray-200 bg-gray-50 overflow-hidden">
                  <Image
                    src={company.logoUrl}
                    alt={`Logo ${company.name}`}
                    fill
                    sizes="56px"
                    className="object-contain p-1"
                    unoptimized
                  />
                </div>
              )}
              <div>
                <p className="text-lg font-semibold text-gray-900">{company.name}</p>
                <p className="text-sm text-gray-500">{company.sector}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-gray-200">
            <h3 className="text-sm font-medium text-gray-500">Tom</h3>
            <p className="text-lg font-semibold text-gray-900 mt-1">
              {toneLabels[company.tone] || company.tone}
            </p>
          </div>

          <div className="bg-white p-6 rounded-xl border border-gray-200">
            <h3 className="text-sm font-medium text-gray-500">Cores da marca</h3>
            <div className="flex gap-2 mt-2">
              {(company.colors || []).map((color, i) => (
                <div
                  key={i}
                  className="w-8 h-8 rounded-full border border-gray-200"
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white p-6 rounded-xl border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Redes Sociais</h3>
            <div className="space-y-3">
              {["instagram", "facebook", "linkedin", "whatsapp"].map((platform) => {
                const account = company.socialAccounts?.find(
                  (a) => a.platform === platform
                );
                return (
                  <div
                    key={platform}
                    className="flex items-center justify-between p-3 rounded-lg bg-gray-50"
                  >
                    <span className="font-medium text-gray-700 capitalize">{platform}</span>
                    {account?.connected ? (
                      <span className="text-sm text-green-600 font-medium">Conectado</span>
                    ) : (
                      <Link href="/social" className="text-sm text-blue-600 hover:underline font-medium">
                        Conectar
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Ações rápidas</h3>
            <div className="space-y-3">
              <Link
                href="/create-post"
                className="block w-full p-4 rounded-lg bg-blue-50 text-blue-700 font-medium hover:bg-blue-100 transition text-left"
              >
                Criar novo post com IA
              </Link>
              <Link
                href="/schedule"
                className="block w-full p-4 rounded-lg bg-purple-50 text-purple-700 font-medium hover:bg-purple-100 transition text-left"
              >
                Agendar publicações
              </Link>
              <Link
                href="/posts"
                className="block w-full p-4 rounded-lg bg-green-50 text-green-700 font-medium hover:bg-green-100 transition text-left"
              >
                Ver meus posts
              </Link>
              <Link
                href="/costs"
                className="block w-full p-4 rounded-lg bg-orange-50 text-orange-700 font-medium hover:bg-orange-100 transition text-left"
              >
                Ver custos de IA
              </Link>
              <Link
                href="/onboarding"
                className="block w-full p-4 rounded-lg bg-gray-50 text-gray-700 font-medium hover:bg-gray-100 transition text-left"
              >
                ⚙️ Editar empresa (cores, logo, tom)
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
