"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";

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
    color: "from-purple-500 to-pink-500",
    description: "Posts no feed e stories",
  },
  {
    id: "facebook",
    name: "Facebook",
    color: "from-blue-600 to-blue-500",
    description: "Posts na página",
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    color: "from-blue-700 to-blue-600",
    description: "Posts profissionais",
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    color: "from-green-500 to-green-400",
    description: "Status e broadcast",
  },
];

export default function SocialPage() {
  const { data: session } = useSession();
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [showTokenModal, setShowTokenModal] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [profileIdInput, setProfileIdInput] = useState("");
  const [profileNameInput, setProfileNameInput] = useState("");

  useEffect(() => {
    if (session) {
      fetch("/api/company")
        .then((res) => res.json())
        .then((data) => {
          if (data?.socialAccounts) {
            setAccounts(data.socialAccounts);
          }
        });
    }
  }, [session]);

  async function connectAccount(platform: string) {
    setConnecting(platform);

    const res = await fetch("/api/social/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        platform,
        accessToken: tokenInput,
        profileId: profileIdInput,
        profileName: profileNameInput || platform,
      }),
    });

    if (res.ok) {
      const account = await res.json();
      setAccounts((prev) => {
        const filtered = prev.filter((a) => a.platform !== platform);
        return [...filtered, account];
      });
    }

    setConnecting(null);
    setShowTokenModal(null);
    setTokenInput("");
    setProfileIdInput("");
    setProfileNameInput("");
  }

  async function disconnectAccount(platform: string) {
    const res = await fetch(`/api/social/connect?platform=${platform}`, {
      method: "DELETE",
    });

    if (res.ok) {
      setAccounts((prev) =>
        prev.map((a) =>
          a.platform === platform ? { ...a, connected: false } : a
        )
      );
    }
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <Link href="/dashboard" className="text-xl font-bold text-blue-600">
              MKT Digital
            </Link>
          </div>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Redes Sociais</h2>
        <p className="text-gray-500 mb-8">
          Conecte suas contas para publicar diretamente pela plataforma.
        </p>

        <div className="space-y-4">
          {PLATFORMS.map((platform) => {
            const account = accounts.find(
              (a) => a.platform === platform.id && a.connected
            );

            return (
              <div
                key={platform.id}
                className="bg-white rounded-xl border border-gray-200 p-6"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div
                      className={`w-12 h-12 rounded-xl bg-gradient-to-br ${platform.color} flex items-center justify-center`}
                    >
                      <span className="text-white font-bold text-lg">
                        {platform.name[0]}
                      </span>
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{platform.name}</h3>
                      <p className="text-sm text-gray-500">{platform.description}</p>
                      {account && (
                        <p className="text-xs text-green-600 mt-1">
                          Conectado como {account.profileName}
                        </p>
                      )}
                    </div>
                  </div>

                  {account ? (
                    <button
                      onClick={() => disconnectAccount(platform.id)}
                      className="px-4 py-2 border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 transition"
                    >
                      Desconectar
                    </button>
                  ) : (
                    <button
                      onClick={() => setShowTokenModal(platform.id)}
                      disabled={connecting === platform.id}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50"
                    >
                      {connecting === platform.id ? "Conectando..." : "Conectar"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-8 p-4 bg-blue-50 rounded-xl border border-blue-100">
          <h4 className="font-medium text-blue-900 mb-2">Como obter os tokens?</h4>
          <ul className="text-sm text-blue-700 space-y-1">
            <li>
              <strong>Instagram/Facebook:</strong> Use o Meta Business Suite para gerar um Page Access Token.
            </li>
            <li>
              <strong>LinkedIn:</strong> Registre um app no LinkedIn Developers e obtenha o OAuth token.
            </li>
            <li>
              <strong>WhatsApp:</strong> Configure via WhatsApp Business API no Meta for Developers.
            </li>
          </ul>
        </div>
      </main>

      {/* Modal de conexão */}
      {showTokenModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Conectar {PLATFORMS.find((p) => p.id === showTokenModal)?.name}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Access Token
                </label>
                <input
                  type="password"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  placeholder="Cole seu token aqui"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ID do Perfil/Página
                </label>
                <input
                  type="text"
                  value={profileIdInput}
                  onChange={(e) => setProfileIdInput(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  placeholder="ID do perfil ou página"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nome do perfil (opcional)
                </label>
                <input
                  type="text"
                  value={profileNameInput}
                  onChange={(e) => setProfileNameInput(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  placeholder="@meuperfil"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowTokenModal(null);
                  setTokenInput("");
                  setProfileIdInput("");
                  setProfileNameInput("");
                }}
                className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
              >
                Cancelar
              </button>
              <button
                onClick={() => connectAccount(showTokenModal)}
                disabled={!tokenInput || !profileIdInput}
                className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50"
              >
                Conectar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
