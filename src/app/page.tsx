import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  Zap,
  Image,
  Calendar,
  ArrowRight,
  CheckCircle2,
  TrendingUp,
  MessageSquare,
} from "lucide-react";

const features = [
  {
    icon: MessageSquare,
    color: "blue",
    title: "Textos com IA",
    description: "Legendas e copies no tom da sua marca: profissional, engraçado ou inspiracional.",
  },
  {
    icon: Image,
    color: "purple",
    title: "Imagens geradas",
    description: "Artes únicas com sua paleta de cores e identidade visual usando Stable Diffusion.",
  },
  {
    icon: Calendar,
    color: "green",
    title: "Agendamento",
    description: "Programe posts para Instagram, Facebook, LinkedIn e WhatsApp em um só lugar.",
  },
  {
    icon: TrendingUp,
    color: "orange",
    title: "Trending Topics",
    description: "Busca automática do que está em alta para criar conteúdo relevante e atual.",
  },
];

const colorMap: Record<string, string> = {
  blue: "bg-blue-50 text-blue-600",
  purple: "bg-purple-50 text-purple-600",
  green: "bg-green-50 text-green-600",
  orange: "bg-orange-50 text-orange-600",
};

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-gray-100 bg-white/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <span className="text-lg font-bold text-gray-900">MKT Digital</span>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="ghost" asChild>
                <Link href="/login">Entrar</Link>
              </Button>
              <Button variant="gradient" asChild>
                <Link href="/register">
                  Começar grátis
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* Background gradient blobs */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 left-1/4 h-96 w-96 rounded-full bg-blue-100 opacity-40 blur-3xl" />
          <div className="absolute top-20 right-1/4 h-80 w-80 rounded-full bg-indigo-100 opacity-40 blur-3xl" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-20 text-center">
          <Badge variant="secondary" className="mb-6 gap-1.5 px-3 py-1.5">
            <Zap className="h-3 w-3 text-blue-600" />
            <span className="text-blue-700 font-medium">Powered by Claude Sonnet + Stable Diffusion</span>
          </Badge>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-gray-900 leading-[1.1] tracking-tight">
            Marketing Digital com{" "}
            <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              Inteligência Artificial
            </span>
          </h1>

          <p className="mt-6 text-xl text-gray-500 max-w-2xl mx-auto leading-relaxed">
            Crie posts, imagens e copies para suas redes sociais em segundos.
            A IA gera conteúdo personalizado com a identidade da sua marca.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Button variant="gradient" size="xl" asChild>
              <Link href="/register">
                Começar agora — é grátis
                <ArrowRight className="h-5 w-5" />
              </Link>
            </Button>
            <Button variant="outline" size="xl" asChild>
              <Link href="/login">Já tenho conta</Link>
            </Button>
          </div>

          <div className="mt-8 flex items-center justify-center gap-6 text-sm text-gray-400">
            {["Sem cartão de crédito", "Setup em 2 minutos", "Cancele quando quiser"].map((item) => (
              <div key={item} className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
              Tudo que você precisa para crescer
            </h2>
            <p className="mt-4 text-lg text-gray-500">
              Uma plataforma completa para gerenciar seu marketing digital com IA.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="group bg-white rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-200"
                >
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 ${colorMap[feature.color]}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-semibold text-gray-900 mb-2">{feature.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{feature.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl p-12 shadow-2xl shadow-blue-200">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Pronto para automatizar seu marketing?
            </h2>
            <p className="text-blue-100 text-lg mb-8">
              Junte-se a centenas de empresas que já usam IA para criar conteúdo.
            </p>
            <Button size="xl" className="bg-white text-blue-700 hover:bg-blue-50 shadow-lg" asChild>
              <Link href="/register">
                Criar conta grátis
                <ArrowRight className="h-5 w-5" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between text-sm text-gray-400">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-blue-600 to-indigo-600">
              <Sparkles className="h-3 w-3 text-white" />
            </div>
            <span className="font-medium text-gray-600">MKT Digital</span>
          </div>
          <p>© 2026 MKT Digital. Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  );
}
