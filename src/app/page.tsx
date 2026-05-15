import Link from "next/link";
import { Button } from "@client/components/ui/button";
import { Badge } from "@client/components/ui/badge";
import {
  Sparkles,
  Zap,
  ImageIcon,
  Calendar,
  ArrowRight,
  CheckCircle2,
  TrendingUp,
  MessageSquare,
  Share2,
  BarChart3,
  Clock,
  Shield,
  Star,
} from "lucide-react";

// ─── Dados ───────────────────────────────────────────────────────────────────

const features = [
  {
    icon: MessageSquare,
    color: "blue",
    title: "Textos com IA",
    description:
      "Claude Sonnet gera 3 opções de legenda no tom da sua marca — profissional, engraçado ou inspiracional. Escolha a melhor em segundos.",
  },
  {
    icon: ImageIcon,
    color: "purple",
    title: "Imagens profissionais",
    description:
      "Stable Diffusion Ultra cria artes únicas com sua paleta de cores e identidade visual. Sem banco de imagens, sem designer.",
  },
  {
    icon: Calendar,
    color: "green",
    title: "Agendamento inteligente",
    description:
      "Programe posts para Instagram, Facebook, LinkedIn e WhatsApp. Publique no melhor horário automaticamente.",
  },
  {
    icon: TrendingUp,
    color: "orange",
    title: "Trending Topics",
    description:
      "A plataforma busca o que está em alta agora e sugere pautas relevantes para o seu negócio em tempo real.",
  },
  {
    icon: Share2,
    color: "pink",
    title: "Multi-plataforma",
    description:
      "Conecte todas as suas redes sociais e publique em todas ao mesmo tempo com um único clique.",
  },
  {
    icon: BarChart3,
    color: "teal",
    title: "Controle de custos",
    description:
      "Dashboard completo com rastreamento de tokens, imagens geradas e custo por post. Transparência total.",
  },
];

const colorMap: Record<string, string> = {
  blue: "bg-blue-50 text-blue-600",
  purple: "bg-purple-50 text-purple-600",
  green: "bg-green-50 text-green-600",
  orange: "bg-orange-50 text-orange-600",
  pink: "bg-pink-50 text-pink-600",
  teal: "bg-teal-50 text-teal-600",
};

const plans = [
  {
    name: "Starter",
    description: "Ideal para pequenos negócios começando no digital",
    price: "R$ 497",
    period: "/mês",
    highlight: false,
    badge: null,
    posts: 8,
    networks: 1,
    networkLabel: "1 rede social",
    features: [
      "8 posts por mês",
      "1 rede social",
      "Geração de texto com IA",
      "Geração de imagem com IA",
      "Suporte por e-mail",
    ],
    missing: ["Agendamento automático", "Trending Topics", "Suporte prioritário"],
    cta: "Assinar Starter",
    ctaVariant: "outline" as const,
  },
  {
    name: "Profissional",
    description: "Para empresas que querem crescer com consistência",
    price: "R$ 997",
    period: "/mês",
    highlight: true,
    badge: "Mais popular",
    posts: 20,
    networks: 3,
    networkLabel: "3 redes sociais",
    features: [
      "20 posts por mês",
      "3 redes sociais",
      "Geração de texto com IA",
      "Geração de imagem com IA",
      "Agendamento automático",
      "Trending Topics",
      "Suporte prioritário",
    ],
    missing: [],
    cta: "Assinar Profissional",
    ctaVariant: "gradient" as const,
  },
  {
    name: "Agência",
    description: "Para agências e empresas com alto volume de conteúdo",
    price: "R$ 1.997",
    period: "/mês",
    highlight: false,
    badge: null,
    posts: 50,
    networks: 4,
    networkLabel: "Todas as redes (4)",
    features: [
      "50 posts por mês",
      "Todas as redes sociais (4)",
      "Geração de texto com IA",
      "Geração de imagem com IA",
      "Agendamento automático",
      "Trending Topics",
      "Suporte dedicado",
      "Relatório mensal de performance",
    ],
    missing: [],
    cta: "Assinar Agência",
    ctaVariant: "outline" as const,
  },
];

const testimonials = [
  {
    name: "Ana Paula Ferreira",
    role: "Proprietária — Salão Beleza & Arte",
    text: "Antes eu gastava R$2.000/mês com uma agência e recebia 8 posts. Agora gero 20 posts por mês com a identidade da minha marca por menos da metade.",
    stars: 5,
  },
  {
    name: "Carlos Mendes",
    role: "Gerente de Marketing — TechSolutions",
    text: "A qualidade das imagens geradas é impressionante. Nossos posts no LinkedIn triplicaram o engajamento em 60 dias.",
    stars: 5,
  },
  {
    name: "Juliana Costa",
    role: "Fundadora — Loja Orgânica",
    text: "O agendamento automático mudou minha vida. Configuro os posts no domingo e a semana toda está coberta.",
    stars: 5,
  },
];

const networks = [
  { label: "Instagram", color: "text-pink-500", emoji: "📸" },
  { label: "Facebook", color: "text-blue-600", emoji: "👥" },
  { label: "LinkedIn", color: "text-blue-700", emoji: "💼" },
  { label: "WhatsApp", color: "text-green-500", emoji: "💬" },
];

// ─── Componente ───────────────────────────────────────────────────────────────

export default function Home() {
  return (
    <div className="min-h-screen bg-white">

      {/* ── Nav ── */}
      <nav className="sticky top-0 z-50 border-b border-gray-100 bg-white/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <span className="text-lg font-bold text-gray-900">MKT Digital</span>
            </div>
            <div className="hidden md:flex items-center gap-6 text-sm font-medium text-gray-600">
              <a href="#funcionalidades" className="hover:text-gray-900 transition-colors">Funcionalidades</a>
              <a href="#planos" className="hover:text-gray-900 transition-colors">Planos</a>
              <a href="#depoimentos" className="hover:text-gray-900 transition-colors">Depoimentos</a>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="ghost" asChild>
                <Link href="/login">Entrar</Link>
              </Button>
              <Button variant="gradient" asChild>
                <Link href="#planos">
                  Ver planos
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 left-1/4 h-96 w-96 rounded-full bg-blue-100 opacity-50 blur-3xl" />
          <div className="absolute top-20 right-1/4 h-80 w-80 rounded-full bg-indigo-100 opacity-50 blur-3xl" />
          <div className="absolute bottom-0 left-1/2 h-64 w-64 rounded-full bg-purple-100 opacity-30 blur-3xl" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-20 text-center">
          <Badge variant="secondary" className="mb-6 gap-1.5 px-3 py-1.5">
            <Zap className="h-3 w-3 text-blue-600" />
            <span className="text-blue-700 font-medium">Claude Sonnet 4.6 + Stable Diffusion Ultra</span>
          </Badge>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-gray-900 leading-[1.1] tracking-tight">
            Seu marketing digital{" "}
            <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              no piloto automático
            </span>
          </h1>

          <p className="mt-6 text-xl text-gray-500 max-w-2xl mx-auto leading-relaxed">
            A IA cria textos, imagens e agenda posts nas suas redes sociais.
            Você foca no seu negócio. Nós cuidamos do conteúdo.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Button variant="gradient" size="xl" asChild>
              <Link href="#planos">
                Escolher meu plano
                <ArrowRight className="h-5 w-5" />
              </Link>
            </Button>
            <Button variant="outline" size="xl" asChild>
              <Link href="/login">Já sou cliente</Link>
            </Button>
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-sm text-gray-400">
            {[
              { icon: Shield, text: "Pagamento seguro" },
              { icon: Clock, text: "Setup em 5 minutos" },
              { icon: CheckCircle2, text: "Cancele quando quiser" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-1.5">
                <Icon className="h-4 w-4 text-green-500" />
                {text}
              </div>
            ))}
          </div>

          {/* Redes sociais suportadas */}
          <div className="mt-12 flex flex-wrap items-center justify-center gap-4 text-sm text-gray-400">
            <span>Integrado com</span>
            {networks.map(({ label, color, emoji }) => (
              <div key={label} className="flex items-center gap-1.5 ml-1">
                <span className="text-lg">{emoji}</span>
                <span className={`font-medium ${color}`}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Funcionalidades ── */}
      <section id="funcionalidades" className="py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <Badge variant="secondary" className="mb-4">Funcionalidades</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
              Tudo que você precisa em um só lugar
            </h2>
            <p className="mt-4 text-lg text-gray-500 max-w-2xl mx-auto">
              Da criação ao agendamento, a plataforma cuida de todo o ciclo do seu conteúdo digital.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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

      {/* ── Como funciona ── */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <Badge variant="secondary" className="mb-4">Como funciona</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
              Do zero ao post publicado em minutos
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {[
              { step: "01", title: "Configure sua empresa", desc: "Informe nome, setor, tom de voz e cores da marca. A IA aprende sua identidade." },
              { step: "02", title: "Descreva o post", desc: "Diga o que quer comunicar. A IA traduz sua ideia em prompt técnico otimizado." },
              { step: "03", title: "Escolha texto e imagem", desc: "Receba 3 opções de texto e 3 imagens geradas. Selecione a melhor combinação." },
              { step: "04", title: "Publique ou agende", desc: "Publique agora ou agende para o melhor horário. Automático em todas as redes." },
            ].map(({ step, title, desc }) => (
              <div key={step} className="text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-bold text-lg mx-auto mb-4">
                  {step}
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">{title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Planos ── */}
      <section id="planos" className="py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <Badge variant="secondary" className="mb-4">Planos e preços</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
              Escolha o plano ideal para o seu negócio
            </h2>
            <p className="mt-4 text-lg text-gray-500">
              Sem taxa de setup. Cancele quando quiser. Cobrança mensal recorrente.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`relative rounded-2xl p-8 ${
                  plan.highlight
                    ? "bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-2xl shadow-blue-200 scale-105"
                    : "bg-white border border-gray-200 shadow-sm"
                }`}
              >
                {plan.badge && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span className="bg-orange-500 text-white text-xs font-bold px-4 py-1.5 rounded-full shadow-lg">
                      {plan.badge}
                    </span>
                  </div>
                )}

                <div className="mb-6">
                  <h3 className={`text-xl font-bold mb-1 ${plan.highlight ? "text-white" : "text-gray-900"}`}>
                    {plan.name}
                  </h3>
                  <p className={`text-sm ${plan.highlight ? "text-blue-100" : "text-gray-500"}`}>
                    {plan.description}
                  </p>
                </div>

                <div className="mb-6">
                  <span className={`text-4xl font-bold ${plan.highlight ? "text-white" : "text-gray-900"}`}>
                    {plan.price}
                  </span>
                  <span className={`text-sm ${plan.highlight ? "text-blue-200" : "text-gray-400"}`}>
                    {plan.period}
                  </span>
                </div>

                {/* Destaque do plano */}
                <div className={`rounded-xl p-4 mb-6 ${plan.highlight ? "bg-white/10" : "bg-gray-50"}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <ImageIcon className={`h-4 w-4 ${plan.highlight ? "text-blue-200" : "text-blue-600"}`} />
                    <span className={`text-sm font-semibold ${plan.highlight ? "text-white" : "text-gray-900"}`}>
                      {plan.posts} posts/mês
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Share2 className={`h-4 w-4 ${plan.highlight ? "text-blue-200" : "text-blue-600"}`} />
                    <span className={`text-sm font-semibold ${plan.highlight ? "text-white" : "text-gray-900"}`}>
                      {plan.networkLabel}
                    </span>
                  </div>
                </div>

                <ul className="space-y-3 mb-8">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5">
                      <CheckCircle2 className={`h-4 w-4 mt-0.5 shrink-0 ${plan.highlight ? "text-green-300" : "text-green-500"}`} />
                      <span className={`text-sm ${plan.highlight ? "text-blue-50" : "text-gray-600"}`}>{f}</span>
                    </li>
                  ))}
                  {plan.missing.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 opacity-40">
                      <div className={`h-4 w-4 mt-0.5 shrink-0 rounded-full border-2 ${plan.highlight ? "border-blue-300" : "border-gray-300"}`} />
                      <span className={`text-sm line-through ${plan.highlight ? "text-blue-200" : "text-gray-400"}`}>{f}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  variant={plan.highlight ? "default" : plan.ctaVariant}
                  size="lg"
                  className={`w-full ${plan.highlight ? "bg-white text-blue-700 hover:bg-blue-50" : ""}`}
                  asChild
                >
                  <Link href="/register">
                    {plan.cta}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            ))}
          </div>

          <p className="text-center text-sm text-gray-400 mt-8">
            Todos os planos incluem geração de texto e imagem com IA, dashboard de custos e suporte.
            Preços em BRL. Cobrança mensal recorrente via cartão de crédito.
          </p>
        </div>
      </section>

      {/* ── Depoimentos ── */}
      <section id="depoimentos" className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <Badge variant="secondary" className="mb-4">Depoimentos</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
              Quem já usa, recomenda
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((t) => (
              <div key={t.name} className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                <div className="flex gap-0.5 mb-4">
                  {Array.from({ length: t.stars }).map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <p className="text-gray-600 text-sm leading-relaxed mb-4">"{t.text}"</p>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{t.name}</p>
                  <p className="text-gray-400 text-xs">{t.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Final ── */}
      <section className="py-24 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl p-12 shadow-2xl shadow-blue-200">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Pronto para automatizar seu marketing?
            </h2>
            <p className="text-blue-100 text-lg mb-8 max-w-xl mx-auto">
              Escolha seu plano e comece a publicar conteúdo profissional com IA ainda hoje.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="xl" className="bg-white text-blue-700 hover:bg-blue-50 shadow-lg" asChild>
                <Link href="#planos">
                  Ver planos e preços
                  <ArrowRight className="h-5 w-5" />
                </Link>
              </Button>
              <Button size="xl" variant="outline" className="border-white/30 text-white hover:bg-white/10" asChild>
                <Link href="/login">Já tenho conta</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-100 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-gray-400">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600">
                <Sparkles className="h-3.5 w-3.5 text-white" />
              </div>
              <span className="font-semibold text-gray-700">MKT Digital</span>
            </div>
            <div className="flex gap-6">
              <a href="#funcionalidades" className="hover:text-gray-600 transition-colors">Funcionalidades</a>
              <a href="#planos" className="hover:text-gray-600 transition-colors">Planos</a>
              <Link href="/login" className="hover:text-gray-600 transition-colors">Login</Link>
            </div>
            <p>© 2026 MKT Digital. Todos os direitos reservados.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
