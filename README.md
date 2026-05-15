# MKT Digital Platform

Plataforma SaaS de marketing digital com IA para geração de conteúdo (texto e imagem) para redes sociais.

## Stack

- **Frontend:** Next.js 16, React 19, Tailwind CSS v4, shadcn/ui
- **Backend:** Next.js API Routes, Prisma ORM, NextAuth
- **IA:** AWS Bedrock (Claude Sonnet 4.6 + Stable Diffusion Ultra)
- **Banco:** SQLite (dev) → PostgreSQL (produção)
- **Testes:** Jest + ts-jest

## Estrutura do projeto

```
src/
├── app/                    # Next.js App Router (páginas + API routes)
│   ├── (auth)/             # Login e registro
│   ├── (dashboard)/        # Páginas autenticadas
│   └── api/                # Endpoints REST
│
├── client/                 # FRONT — código do browser
│   └── components/
│       ├── ui/             # Componentes base (Button, Card, Input...)
│       ├── layout/         # Sidebar, DashboardLayout
│       └── auth/           # AuthProvider
│
└── server/                 # BACK — lógica de negócio
    ├── lib/                # Utilitários (auth, bedrock, logger, prisma...)
    ├── services/           # Regras de negócio
    ├── repositories/       # Acesso ao banco de dados
    └── __tests__/          # Testes unitários
```

## Setup rápido

### Pré-requisitos

- Node.js 20+
- AWS CLI v2 com profile `mktai` configurado
- Git

### Instalação

```bash
npm install
npx prisma generate
npx prisma db push
npx tsx prisma/seed.ts
```

### Executar

```bash
# Windows (PowerShell)
$env:AWS_PROFILE="mktai"
npm run dev

# macOS/Linux
AWS_PROFILE=mktai npm run dev
```

Acesse: http://localhost:3030

**Credenciais demo:** `demo@mktdigital.com` / `demo123`

## Scripts disponíveis

| Script | Descrição |
|--------|-----------|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run lint` | Verificação de código |
| `npm run type-check` | Verificação TypeScript |
| `npm test` | Executa testes |
| `npm run test:coverage` | Testes com cobertura |
| `npm run db:push` | Sincroniza schema com banco |
| `npm run db:seed` | Popula banco com dados demo |
| `npm run db:studio` | Abre Prisma Studio |

## Variáveis de ambiente

Copie `.env.example` para `.env` e preencha:

```bash
cp .env.example .env
```

## AWS Bedrock

O projeto usa dois modelos:

| Modelo | Região | Uso |
|--------|--------|-----|
| `us.anthropic.claude-sonnet-4-6` | us-east-1 | Geração de texto |
| `stability.stable-image-ultra-v1:1` | us-west-2 | Geração de imagens |

### Configurar profile AWS

```bash
aws configure --profile mktai
```

### Renovar credenciais (Isengard)

```bash
ada credentials update --profile=mktai --account=124355648474 --role=Admin --once
```

## Funcionalidades

- ✅ Autenticação (email/senha + Google OAuth)
- ✅ Onboarding de empresa (nome, setor, tom, cores, logo)
- ✅ Geração de texto com Claude (3 opções)
- ✅ Geração de imagem com Stable Diffusion Ultra (3 variações)
- ✅ Tradução automática de prompts (PT → EN via Claude)
- ✅ Overlay de texto integrado nas imagens
- ✅ Busca de trending topics
- ✅ Agendamento de posts com calendário
- ✅ Conexão com redes sociais (Instagram, Facebook, LinkedIn, WhatsApp)
- ✅ Publicação automática via cron job
- ✅ Dashboard de custos de IA

## Roadmap

- [ ] Migração para PostgreSQL
- [ ] Upload de imagens para S3
- [ ] Sistema de planos e assinaturas (Stripe)
- [ ] Geração de vídeo (HeyGen/Runway)
- [ ] Dashboard de métricas das redes sociais
- [ ] Rate limiting com Redis
