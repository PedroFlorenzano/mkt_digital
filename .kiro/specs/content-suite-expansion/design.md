# Design — Content Suite Expansion

## Overview

A expansão da suíte de conteúdo adiciona dez capacidades novas à plataforma MKT Digital sobre a infraestrutura já existente (Next.js App Router, TypeScript, Prisma/SQLite, AWS Bedrock, Instagram Graph API v19.0):

| Área | Novos componentes |
|---|---|
| Formatos de conteúdo | Carousel_Builder, Reel Publisher, Story Publisher |
| Identidade visual | Brand-aware image generation (Variation_Set) |
| Monetização de posts | Boost_Advisor + Boost_Campaign |
| Inteligência de anúncios | Strategic_Analyst + Route_Change |
| Gestão de perfil Instagram | Bio_Generator, Feed_Grid, Profile_Auditor |
| Persistência | Migrações Prisma retrocompatíveis com SQLite |

Todos os componentes novos seguem os mesmos padrões já estabelecidos: serviços em `src/server/services/`, rotas Next.js em `src/app/api/`, componentes React em `src/client/`, e o cliente Prisma compartilhado em `src/server/lib/prisma.ts`.

---

## Architecture

### Visão geral de camadas

```
┌──────────────────────────────────────────────────────────────────────┐
│  Next.js App Router (src/app/)                                       │
│  Pages: /create-post, /posts, /paid-traffic, /instagram-profile      │
├──────────────────────────────────────────────────────────────────────┤
│  API Routes (src/app/api/)                                           │
│  /generate/carousel  /generate/story  /generate/reel-caption        │
│  /social/publish     /posts/[id]/boost  /paid-traffic/strategy      │
│  /instagram/bio      /instagram/grid    /instagram/audit            │
├──────────────────────────────────────────────────────────────────────┤
│  Services (src/server/services/)                                     │
│  carousel.service    reel.service       story.service               │
│  variation.service   boost.service      strategic-analyst.service   │
│  bio.service         feed-grid.service  profile-auditor.service     │
├──────────────────────────────────────────────────────────────────────┤
│  Lib / Connectors (src/server/lib/)                                  │
│  bedrock.ts (existente, expandido)    social.ts (expandido)         │
│  meta-ads.connector  google-ads.connector   prisma.ts               │
├──────────────────────────────────────────────────────────────────────┤
│  Persistência                                                        │
│  SQLite via Prisma — migrações retrocompatíveis                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Decisões arquiteturais

1. **Nenhum novo banco de dados.** Todo novo dado é serializado como JSON em campos `String?` do SQLite, seguindo o padrão já adotado para `aiDraftJson`, `externalAdIds` etc.

2. **Bedrock centralizado.** Todos os novos serviços chamam `generateTextWithBedrock` e `generateImageWithBedrock` do `bedrock.ts` existente. Para Stories e Carrossel, o `aspect_ratio` do payload para Stable Diffusion Ultra é parametrizado.

3. **Publicação social encapsulada.** `src/server/lib/social.ts` recebe novas funções (`publishCarouselToInstagram`, `publishReelToInstagram`, `publishStoryToInstagram`) mantendo a interface `SocialPublishResult`.

4. **Safety gates para Boost e Route_Change.** A criação de `AdCampaign` com `campaignType = "boost"` e a execução de Route_Changes destrutivas são bloqueadas por verificação de `CampaignAuditLog` existente antes de qualquer chamada à API de anúncios.

5. **Sem PubSub nem worker externo.** A plataforma não tem infraestrutura de fila. Jobs de geração de imagem são síncronos com timeout configurável (60 s para imagens via Bedrock).

---

## Components and Interfaces

### 1. Carousel_Builder (`carousel.service.ts`)

```typescript
interface Slide {
  id: string;        // cuid gerado no servidor
  imageUrl: string;  // URL pública ou data-URL base64
  headline: string;  // máx 60 caracteres
  order: number;     // posição 0-based
}

interface CarouselResult {
  slides: Slide[];   // 3 ≤ length ≤ 10
  slidesJson: string; // JSON.stringify(slides)
}

// Lança ValidationError se slideCount < 3 || slideCount > 10
function buildCarousel(slides: Slide[]): CarouselResult

// Reordena preservando o conjunto de IDs
function reorderSlides(current: Slide[], fromIndex: number, toIndex: number): Slide[]
```

**Fluxo de geração:**
1. API route recebe `{ companyId, topic, slideCount (3–10) }`
2. `carousel.service` chama `generateImageWithBedrock` com `aspect_ratio: "1:1"` e `count = slideCount`
3. Para cada imagem gerada, chama `generateTextWithBedrock` pedindo headline ≤ 60 chars
4. Monta `Slide[]`, valida cardinalidade, serializa em `slidesJson`
5. Cria `Post` com `format = "carousel"` e `slidesJson` preenchido

**Publicação no Instagram:**

```
POST /{profileId}/media (container individual — repete para cada slide)
  → image_url, is_carousel_item=true

POST /{profileId}/media (container do álbum)
  → media_type=CAROUSEL_ALBUM, children=[ids]

POST /{profileId}/media_publish
  → creation_id=<albumContainerId>
```

---

### 2. Reel Publisher (`reel.service.ts`)

```typescript
interface ReelPublishInput {
  postId: string;
  videoUrl: string;        // URL pública do vídeo
  durationSeconds: number; // validado: [15, 60]
  caption: string;         // ≤ 2200 chars
  hashtags: string[];      // 5–30 itens
}

// Lança ValidationError se duration fora de [15, 60]
// Lança ValidationError se conta Instagram não conectada
// Lança ValidationError se videoUrl ausente
function validateReelPublish(input: ReelPublishInput): void
```

**Publicação no Instagram:**

```
POST /{profileId}/media
  → media_type=REELS, video_url=<videoUrl>, caption=<caption>

POST /{profileId}/media_publish
  → creation_id=<containerId>
```

Geração de legenda/hashtags: `generateTextWithBedrock` com prompt que recebe `brandContext` e retorna `{ caption, hashtags[] }`.

---

### 3. Story Publisher (`story.service.ts`)

```typescript
interface StoryGenerationResult {
  imageUrl: string;
  width: number;   // deve ser ≈ 9/16 * height
  height: number;
  textOverlay: string;
  format: "story";
}

// Retorna true se abs(width/height - 9/16) ≤ tolerância de 1px por dimensão
function isValidStoryAspectRatio(width: number, height: number): boolean

// Máximo de 2 tentativas internas; lança após esgotamento
async function generateStoryImage(companyId: string, objective: string): Promise<StoryGenerationResult>
```

O campo `aspect_ratio` enviado ao Stable Diffusion Ultra é `"9:16"`. O overlay textual é posicionado pela instrução de prompt para ocupar a região abaixo de 70% da altura.

**Validação de agendamento:** `scheduledAt` não pode ser > `Date.now() + 24h` para posts com `format = "story"`.

---

### 4. Variation Service (`variation.service.ts`)

```typescript
interface VariationSet {
  sessionId: string;   // ID da sessão de criação (gerado no frontend, UUID)
  variations: string[]; // exatamente 3 data-URLs de imagem
  callIndex: number;   // 0-based, cresce a cada "Gerar mais"
}

// brandContext é construído a partir do modelo Company
interface BrandContext {
  colors: string[];    // hexadecimais; pode ser []
  tone: string;
  sector: string;
  objective: string;
}

function buildBrandPrompt(base: string, ctx: BrandContext): string
// → injeta cores, tom e setor no prompt; avisa se colors vazio
```

Cada chamada a "Gerar mais variações" invoca `generateImageWithBedrock` com `count = 3` e acumula no estado do componente React (não persiste intermediários no banco).

---

### 5. Boost_Advisor (`boost.service.ts`)

```typescript
interface BoostSuggestion {
  objective: string;
  audience: string;
  dailyBudgetBrl: number; // R$ 5,00–300,00
  durationDays: number;   // 1–30
  briefingText: string;   // para usuários sem credenciais
}

// Lança ExternalServiceError se Bedrock falhar
async function analyzePost(companyId: string, postId: string): Promise<BoostSuggestion>

// Cria CampaignAuditLog com userDecision='approved' ANTES de criar AdCampaign
// Lança se não houver log de aprovação prévio
async function confirmBoost(
  companyId: string,
  postId: string,
  suggestion: BoostSuggestion,
  credentialId: string,
): Promise<AdCampaign>
```

**Invariante de segurança:** `confirmBoost` verifica a existência de `CampaignAuditLog { requiresConfirmation: true, userDecision: 'approved', campaignId: <pendingId> }` antes de chamar a API da plataforma de anúncios. Se não encontrar, lança `ForbiddenError`.

---

### 6. Strategic_Analyst (`strategic-analyst.service.ts`)

```typescript
interface StrategicDiagnosis {
  strengths: CampaignStrength[];
  alerts: CampaignAlert[];
  routeChanges: RouteChange[]; // exatamente 3
}

interface RouteChange {
  id: string;
  title: string;
  description: string;
  expectedImpact: string;
  type: "budget" | "audience" | "pause" | "editorial";
  requiresConfirmation: boolean; // true para budget | audience | pause
}

// Filtra campanhas com ≥ 7 dias de snapshots nos últimos 30 dias
// Lança se nenhuma campanha elegível
async function generateDiagnosis(companyId: string): Promise<StrategicDiagnosis>

// Aplica a Route_Change; para tipos destrutivos, valida CampaignAuditLog
async function applyRouteChange(
  companyId: string,
  routeChange: RouteChange,
  auditLogId?: string,
): Promise<void>
```

---

### 7. Bio_Generator (`bio.service.ts`)

```typescript
interface BioSuggestion {
  text: string;  // ≤ 150 chars
  hasEmoji: boolean;
  hasCta: boolean;
}

// Lança ValidationError se name | sector | objective ausentes
// Lança ExternalServiceError (com timeout 30s) se Bedrock falhar
// Sempre retorna exatamente 3 sugestões
async function generateBioSuggestions(companyId: string): Promise<BioSuggestion[]>
```

---

### 8. Feed_Grid Service (`feed-grid.service.ts`)

```typescript
interface FeedGridPost {
  id: string;
  imageUrl: string | null;
  status: "published" | "scheduled" | "draft";
  publishedAt: Date | null;
  scheduledAt: Date | null;
  createdAt: Date;
  gridPosition: number; // 0-based, calculado no serviço
}

// Retorna posts do Instagram ordenados: publicados primeiro (desc publishedAt),
// depois futuros (asc scheduledAt || createdAt)
async function getFeedGrid(companyId: string): Promise<FeedGridPost[]>

// Persiste nova ordem apenas para posts não-publicados
// Lança ForbiddenError se tentativa de mover post publicado
async function reorderGrid(
  companyId: string,
  reorderedPostIds: string[],
): Promise<void>
```

A posição persistida é armazenada no campo `gridOrder` (`Int?`) adicionado ao modelo `Post`.

---

### 9. Profile_Auditor (`profile-auditor.service.ts`)

```typescript
interface AuditInput {
  bio: string;
  followers: number;
  engagementRate: number; // 0.0–100.0
  niche: string;
}

interface AuditResult {
  score: number;          // inteiro [0, 100]
  components: AuditComponent[];
  recommendations: string[]; // ≥ 3 itens
}

// Lança ValidationError se qualquer campo obrigatório ausente
// Lança ExternalServiceError se Bedrock não responder
async function auditProfile(companyId: string, input: AuditInput): Promise<AuditResult>
```

---

## Data Models

### Alterações ao modelo `Post`

```prisma
model Post {
  // … campos existentes …

  // Novos campos — todos opcionais para retrocompatibilidade
  format              String?   @default("post")
  // "post" | "carousel" | "reel" | "story"

  slidesJson          String?
  // JSON: Slide[] — slides do carrossel

  boostSuggestionJson String?
  // JSON: BoostSuggestion — sugestão gerada pelo Boost_Advisor

  boostCampaignId     String?
  // ID do AdCampaign criado via boost

  gridOrder           Int?
  // Posição no Feed_Grid; null = sem ordem explícita
}
```

### Alterações ao modelo `AdCampaign`

```prisma
model AdCampaign {
  // … campos existentes …

  campaignType        String
  // existente; agora aceita também "boost"

  sourcePostId        String?
  // ID do Post que originou o boost

  boostConfirmedAt    DateTime?
  // Timestamp da Confirmation_Event do usuário
}
```

### Sem novos modelos de topo

Todos os novos dados (slides, sugestões de boost, diagnóstico estratégico, sugestões de bio, resultado de auditoria) são serializado como JSON em campos `String?` já listados ou em campos existentes do `CampaignAuditLog.metadata`. Isso preserva compatibilidade total com SQLite.

### Índices adicionais

```prisma
// Post
@@index([companyId, format])
@@index([companyId, platform, status])

// AdCampaign
@@index([sourcePostId])
```

### Migração Prisma

Uma única migração será gerada cobrindo todos os campos novos. Todos os campos são `?` (opcionais) e têm `@default` onde aplicável, garantindo que linhas existentes não precisem de backfill.

```sql
-- Exemplo parcial da migração esperada
ALTER TABLE "Post" ADD COLUMN "format" TEXT DEFAULT 'post';
ALTER TABLE "Post" ADD COLUMN "slidesJson" TEXT;
ALTER TABLE "Post" ADD COLUMN "boostSuggestionJson" TEXT;
ALTER TABLE "Post" ADD COLUMN "boostCampaignId" TEXT;
ALTER TABLE "Post" ADD COLUMN "gridOrder" INTEGER;

ALTER TABLE "AdCampaign" ADD COLUMN "sourcePostId" TEXT;
ALTER TABLE "AdCampaign" ADD COLUMN "boostConfirmedAt" DATETIME;
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Invariante de cardinalidade de slides do carrossel

*Para qualquer* conjunto de parâmetros de geração válido, o `CarouselResult` retornado pelo `Carousel_Builder` satisfaz `3 ≤ slides.length ≤ 10`.

**Validates: Requirements 1.1, 1.5, 1.6**

---

### Property 2: Invariante de reordenação do carrossel

*Para qualquer* carrossel válido e qualquer sequência de operações de reordenação (drag-and-drop), o conjunto de IDs dos slides após a reordenação é idêntico ao conjunto de IDs antes da reordenação — sem perdas, sem duplicatas.

**Validates: Requirements 1.3**

---

### Property 3: Invariante de duração do Reel

*Para qualquer* vídeo submetido para publicação como Reel, a Plataforma rejeita o vídeo se e somente se a duração estiver fora do intervalo `[15, 60]` segundos.

**Validates: Requirements 2.1, 2.2**

---

### Property 4: Invariante de proporção do Story

*Para qualquer* imagem gerada pelo `story.service` para o formato Stories, a razão `width / height` satisfaz `9 / 16` com tolerância de ±1 pixel por dimensão, i.e., `abs(width * 16 - height * 9) ≤ 16 + 9`.

**Validates: Requirements 3.1, 3.7**

---

### Property 5: Brand_Context sempre presente no prompt de imagem

*Para qualquer* chamada de geração de imagem de uma empresa com paleta de cores cadastrada (`colors` não nulo e não vazio), o prompt enviado ao Stable Diffusion Ultra contém todos os valores hexadecimais das cores do campo `colors` da empresa.

**Validates: Requirements 4.1**

---

### Property 6: Cardinalidade e acumulação de variações

*Para qualquer* sessão de criação e `N` chamadas de "Gerar mais variações" (N ≥ 0), o conjunto de variações exibido ao usuário contém exatamente `3 + N × 3` variações, sem duplicatas e sem remoção de variações anteriores.

**Validates: Requirements 4.2, 4.3**

---

### Property 7: Safety — nenhuma Boost_Campaign sem confirmação

*Para qualquer* post e qualquer estado de credenciais, a criação de um registro `AdCampaign` com `campaignType = "boost"` nunca ocorre sem a existência prévia de um `CampaignAuditLog` correspondente com `userDecision = "approved"`.

**Validates: Requirements 5.3, 5.6**

---

### Property 8: Cardinalidade de Route_Changes

*Para qualquer* conjunto de campanhas ativas com dados suficientes (≥ 7 dias de snapshots nos últimos 30 dias), o diagnóstico retornado pelo `Strategic_Analyst` contém exatamente 3 `RouteChange`s.

**Validates: Requirements 6.2**

---

### Property 9: Invariante de comprimento das sugestões de bio

*Para qualquer* perfil de empresa válido (com `name`, `sector` e `objective` preenchidos), todas as sugestões de bio retornadas pelo `Bio_Generator` satisfazem `len(bio) ≤ 150` caracteres.

**Validates: Requirements 7.2**

---

### Property 10: Cardinalidade das sugestões de bio

*Para qualquer* perfil de empresa válido, o `Bio_Generator` retorna exatamente 3 sugestões de bio.

**Validates: Requirements 7.1**

> **Nota sobre Properties 9 e 10:** Embora relacionadas, não são redundantes. Property 9 testa a invariante de comprimento de cada sugestão individual; Property 10 testa a cardinalidade do conjunto retornado. Uma implementação pode retornar 3 sugestões longas (falha P9, passa P10) ou 2 sugestões curtas (passa P9, falha P10).

---

### Property 11: Imutabilidade da ordem de posts publicados no Feed_Grid

*Para qualquer* sequência de operações de reordenação realizadas pelo usuário no `Feed_Grid`, a ordem relativa entre posts com `status = "published"` permanece inalterada.

**Validates: Requirements 8.2, 8.3, 8.6**

---

### Property 12: Faixa de pontuação da auditoria de perfil

*Para qualquer* conjunto de dados de perfil válidos (todos os campos obrigatórios presentes), a pontuação retornada pelo `Profile_Auditor` satisfaz `0 ≤ score ≤ 100` e é um número inteiro.

**Validates: Requirements 9.3**

---

## Error Handling

### Erros de geração de IA (Bedrock)

| Situação | Comportamento |
|---|---|
| Bedrock timeout (> 60s para imagem, > 30s para bio) | Lança `ExternalServiceError`; nenhum dado parcial é salvo; mensagem de erro exibida ao usuário |
| Resposta de imagem fora da proporção (Story) | Retry automático até 2 tentativas; após isso, `ExternalServiceError` |
| Slide count fora de [3, 10] | `ValidationError` imediata; nenhum `Post` criado |
| Duração do Reel fora de [15, 60]s | `ValidationError` imediata; `Post` permanece `"draft"` |
| Bio_Generator sem campos obrigatórios | `ValidationError` antes de invocar Bedrock |
| Profile_Auditor sem campos obrigatórios | `ValidationError` antes de invocar Bedrock |
| Strategic_Analyst sem dados suficientes | Retorna mensagem informativa; nenhum diagnóstico parcial salvo |

### Erros de publicação social (Instagram API)

| Situação | Comportamento |
|---|---|
| Falha na publicação de carrossel | Post permanece `"draft"`; erro da API exibido |
| Falha no upload/publicação de Reel | Post marcado como `"error"`; sem retry automático |
| Falha na publicação de Story | Post marcado como `"error"` |
| Conta não conectada | `ValidationError` antes de chamar a API |

### Erros de Boost e Route_Change

| Situação | Comportamento |
|---|---|
| API de anúncios falha após confirmação | Erro registrado em `CampaignAuditLog.metadata`; `externalCampaignId` não preenchido; log de aprovação preservado |
| Tentativa de criar campanha sem `CampaignAuditLog` aprovado | `ForbiddenError`; nenhuma chamada à API de anúncios |
| Route_Change falha na API | Erro em `CampaignAuditLog.metadata`; estado anterior da campanha preservado |

### Padrão geral de erros

Todos os serviços usam as classes de erro existentes em `src/server/lib/errors.ts`:
- `ValidationError` → HTTP 400
- `NotFoundError` → HTTP 404
- `ForbiddenError` → HTTP 403
- `ExternalServiceError` → HTTP 502

---

## Testing Strategy

### Abordagem dual

A estratégia combina testes unitários baseados em exemplos com testes baseados em propriedades (PBT), seguindo o padrão já adotado pelo projeto (Jest + ts-jest).

**Biblioteca de PBT:** [`fast-check`](https://github.com/dubzzz/fast-check) (TypeScript nativo, integra com Jest sem configuração adicional).

```bash
npm install --save-dev fast-check@3.23.2
```

### Testes unitários por módulo

| Módulo | Foco dos testes unitários |
|---|---|
| `carousel.service` | buildCarousel com 3, 5, 10 slides; rejeição com 2 e 11 slides; reorderSlides preserva conteúdo |
| `reel.service` | validateReelPublish aceita 15s e 60s; rejeita 14s e 61s; rejeita sem videoUrl |
| `story.service` | isValidStoryAspectRatio com dimensões exatas, ±1px e fora da tolerância |
| `variation.service` | buildBrandPrompt contém hexadecimais das cores; aviso quando colors vazio |
| `boost.service` | confirmBoost lança sem CampaignAuditLog aprovado; cria AdCampaign com boostConfirmedAt |
| `strategic-analyst.service` | generateDiagnosis retorna exatamente 3 Route_Changes; retorna mensagem quando sem dados |
| `bio.service` | generateBioSuggestions valida campos obrigatórios antes de chamar Bedrock |
| `feed-grid.service` | reorderGrid proíbe mover posts publicados; persiste nova ordem para rascunhos |
| `profile-auditor.service` | auditProfile valida campos; score retornado é inteiro em [0, 100] |

### Testes de propriedade (PBT com fast-check)

Cada propriedade do design deve ser implementada como um único teste de propriedade com mínimo de 100 iterações:

```typescript
// Exemplo — Property 1: Invariante de cardinalidade de slides
import fc from 'fast-check';
import { buildCarousel } from '@server/services/carousel.service';

test('Property 1: slideCount satisfaz 3 ≤ n ≤ 10 para qualquer entrada válida', () => {
  // Feature: content-suite-expansion, Property 1: slide count invariant
  fc.assert(
    fc.property(
      fc.integer({ min: 3, max: 10 }),
      fc.array(fc.string({ maxLength: 60 }), { minLength: 3, maxLength: 10 }),
      (count, headlines) => {
        const slides = headlines.slice(0, count).map((h, i) => ({
          id: `slide-${i}`, imageUrl: 'https://example.com/img.png',
          headline: h, order: i,
        }));
        const result = buildCarousel(slides);
        return result.slides.length >= 3 && result.slides.length <= 10;
      }
    ),
    { numRuns: 100 }
  );
});
```

**Tabela de mapeamento Property → Teste PBT:**

| Property | Módulo testado | Geradores fast-check |
|---|---|---|
| P1 — Cardinalidade de slides | `buildCarousel` | `fc.integer({min:3,max:10})`, array de slides |
| P2 — Reordenação de carrossel | `reorderSlides` | array de slides + índices de origem/destino |
| P3 — Duração do Reel | `validateReelPublish` | `fc.float()` para duration |
| P4 — Proporção do Story | `isValidStoryAspectRatio` | `fc.integer` para width/height |
| P5 — Brand_Context no prompt | `buildBrandPrompt` | array de hex strings, tone, sector |
| P6 — Acumulação de variações | lógica de acumulação do componente | `fc.integer({min:0,max:10})` para N |
| P7 — Safety Boost | `confirmBoost` (mock Prisma) | post e credencial arbitrários |
| P8 — Route_Changes count | `generateDiagnosis` (mock Bedrock) | arrays de campanhas e snapshots |
| P9 — Comprimento de bio | `generateBioSuggestions` (mock Bedrock) | perfil de empresa válido |
| P10 — Cardinalidade de bio | `generateBioSuggestions` (mock Bedrock) | perfil de empresa válido |
| P11 — Imutabilidade publicados | `reorderGrid` | array de posts mistos + sequência de reordenações |
| P12 — Score de auditoria | `auditProfile` (mock Bedrock) | AuditInput com dados válidos |

### Integração e smoke tests

Para operações que envolvem a API do Instagram e a API de anúncios, utilizar testes de integração com 1–3 exemplos representativos e mocks das respostas externas:

- `publishCarouselToInstagram` — mock do `fetch`, verificar chamadas sequenciais corretas
- `publishReelToInstagram` — mock do `fetch`, verificar `media_type=REELS`
- `publishStoryToInstagram` — mock do `fetch`, verificar `is_stories=true`
- Criação de `AdCampaign` via boost — verificar que `CampaignAuditLog` é criado antes do registro

### Cobertura mínima esperada

- Serviços novos: ≥ 80% de cobertura de linhas
- Funções puras (validação, construção de prompt, serialização): ≥ 95%
- Caminhos de erro (Bedrock timeout, API failure, validação): cobertos por testes de exemplo

### Tag format para testes PBT

```typescript
// Feature: content-suite-expansion, Property N: <descrição resumida da propriedade>
```
