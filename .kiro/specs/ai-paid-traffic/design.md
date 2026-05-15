# Documento de Design — Tráfego Pago com IA

## Visão Geral

O módulo **Tráfego Pago com IA** é uma extensão da MKT Digital Platform que permite a usuários dos planos Profissional e Agência criar, monitorar e otimizar campanhas de anúncios pagos no Meta Ads e Google Ads com auxílio de inteligência artificial (Claude via AWS Bedrock). O módulo automatiza todo o ciclo de vida das campanhas: da criação baseada em linguagem natural, passando pelo monitoramento periódico de performance, execução de regras automáticas, inteligência de orçamento e testes A/B de criativos, até a auditoria completa de todas as ações executadas.

### Objetivos

- Reduzir a barreira técnica para criação de campanhas pagas eficazes.
- Automatizar decisões rotineiras de otimização com segurança e rastreabilidade.
- Entregar relatórios e recomendações em linguagem natural em português.
- Proteger o usuário de alterações financeiras significativas via confirmação explícita (Threshold R$500/dia).

### Escopo

- **Incluído:** Meta Ads (Facebook/Instagram), Google Ads (Search e Display), monitoramento a cada 6h, motor de regras, A/B testing de criativos, inteligência de orçamento, auditoria completa.
- **Excluído:** TikTok Ads, LinkedIn Ads, integração com ferramentas de analytics externas (GA4, Pixel — apenas via parâmetros UTM nos anúncios).

---

## Arquitetura

### Diagrama de Componentes

```
┌─────────────────────────────────────────────────────────────────────┐
│                         BROWSER (Next.js Client)                    │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ /paid-traffic│  │ /paid-traffic│  │ /paid-traffic/credentials│  │
│  │ (dashboard)  │  │ /new (wizard)│  │ (conexão de contas)      │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ /paid-traffic│  │ /paid-traffic│  │ /paid-traffic/audit      │  │
│  │ /rules       │  │ /budget      │  │ (log de auditoria)       │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘  │
└────────────────────────────────┬────────────────────────────────────┘
                                 │ fetch (REST JSON)
┌────────────────────────────────▼────────────────────────────────────┐
│                    NEXT.JS API ROUTES (src/app/api/)                 │
│                                                                     │
│  /api/paid-traffic/credentials                                      │
│  /api/paid-traffic/credentials/[platform]                           │
│  /api/paid-traffic/campaigns/generate                               │
│  /api/paid-traffic/campaigns                                        │
│  /api/paid-traffic/campaigns/[id]/performance                       │
│  /api/paid-traffic/rules                                            │
│  /api/paid-traffic/budget-intelligence                              │
│  /api/paid-traffic/budget-intelligence/apply                        │
│  /api/paid-traffic/audit                                            │
│  /api/cron/paid-traffic-monitor                                     │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
┌────────────────────────────────▼────────────────────────────────────┐
│                    SERVER SERVICES (src/server/services/)            │
│                                                                     │
│  credential.service.ts         campaign.service.ts                  │
│  performance-monitor.service.ts automation-rules.service.ts         │
│  budget-intelligence.service.ts ab-test.service.ts                  │
└──────────────────┬─────────────────────────────┬────────────────────┘
                   │                             │
     ┌─────────────▼──────────┐    ┌─────────────▼──────────┐
     │  AD PLATFORM           │    │  AWS BEDROCK           │
     │  CONNECTORS            │    │                        │
     │  (src/server/lib/)     │    │  Claude Sonnet 4       │
     │                        │    │  Claude Haiku 4.5      │
     │  meta-ads.connector.ts │    │  Stable Diffusion Ultra│
     │  google-ads.connector  │    └────────────────────────┘
     └─────────────┬──────────┘
                   │
     ┌─────────────▼──────────────────────────┐
     │  EXTERNAL APIs                          │
     │  Meta Marketing API v21.0 (REST/fetch)  │
     │  Google Ads API v19 (google-ads-api npm)│
     └─────────────────────────────────────────┘
```

---

## Schema do Banco de Dados (Prisma)

Adições ao arquivo `prisma/schema.prisma`. Todos os modelos a seguir usam `companyId` como chave de isolamento multi-tenant.

```prisma
// ─────────────────────────────────────────────
// Módulo: Tráfego Pago com IA
// ─────────────────────────────────────────────

/// Credenciais de API criptografadas por empresa/plataforma.
/// O campo encryptedData armazena um JSON serializado com { iv, tag, data } (AES-256-GCM).
model AdPlatformCredential {
  id            String   @id @default(cuid())
  companyId     String
  platform      String   // 'meta' | 'google'
  encryptedData String   // JSON: { iv: string, tag: string, data: string }
  isValid       Boolean  @default(false)
  validatedAt   DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  company   Company     @relation(fields: [companyId], references: [id], onDelete: Cascade)
  campaigns AdCampaign[]

  @@unique([companyId, platform])
  @@index([companyId])
}

/// Campanha de anúncio pago — vincula ID interno ao ID externo da plataforma.
model AdCampaign {
  id                   String    @id @default(cuid())
  companyId            String
  credentialId         String
  platform             String    // 'meta' | 'google'
  campaignType         String    // 'search' | 'display' | 'social'
  name                 String
  objective            String
  dailyBudgetBrl       Float
  status               String    @default("draft")
  // 'draft' | 'active' | 'paused' | 'ended' | 'error'
  externalCampaignId   String?
  externalAdSetId      String?
  externalAdIds        String?   // JSON array de IDs
  managerUrl           String?
  aiDraftJson          String?   // JSON: CampaignDraft gerado pela IA
  launchedAt           DateTime?
  createdAt            DateTime  @default(now())
  updatedAt            DateTime  @updatedAt

  company     Company               @relation(fields: [companyId], references: [id], onDelete: Cascade)
  credential  AdPlatformCredential  @relation(fields: [credentialId], references: [id])
  metrics     AdMetricSnapshot[]
  rules       AutomationRule[]
  abTests     AbTest[]
  auditLogs   CampaignAuditLog[]

  @@index([companyId])
  @@index([companyId, status])
  @@index([platform])
}

/// Snapshot de métricas coletadas periodicamente pelo monitor de performance.
/// Retido por no mínimo 90 dias (política de retenção aplicada via job de limpeza).
model AdMetricSnapshot {
  id           String   @id @default(cuid())
  campaignId   String
  collectedAt  DateTime @default(now())
  periodStart  DateTime
  periodEnd    DateTime
  impressions  Int      @default(0)
  clicks       Int      @default(0)
  conversions  Int      @default(0)
  spendBrl     Float    @default(0)
  ctr          Float    @default(0)  // clicks / impressions
  cpc          Float    @default(0)  // spendBrl / clicks
  roas         Float    @default(0)  // revenue / spendBrl
  rawJson      String?  // resposta bruta da API (para auditoria)

  campaign AdCampaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)

  @@index([campaignId])
  @@index([campaignId, collectedAt])
  @@index([collectedAt])
}

/// Regra de automação definida pelo usuário: condição + ação.
model AutomationRule {
  id          String   @id @default(cuid())
  companyId   String
  campaignId  String?  // null = regra global para todas as campanhas da empresa
  name        String
  isActive    Boolean  @default(true)
  // Condição — serializada como JSON: { metric, operator, value }
  conditionJson String
  // Ação — serializada como JSON: { type, budgetIncreasePercent? }
  actionJson    String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  company    Company         @relation(fields: [companyId], references: [id], onDelete: Cascade)
  campaign   AdCampaign?     @relation(fields: [campaignId], references: [id], onDelete: SetNull)
  executions RuleExecutionLog[]

  @@index([companyId])
  @@index([companyId, isActive])
}

/// Log imutável de cada avaliação/execução de uma regra de automação.
model RuleExecutionLog {
  id         String   @id @default(cuid())
  ruleId     String
  campaignId String
  executedAt DateTime @default(now())
  triggered  Boolean  // true se a condição foi satisfeita
  // 'executed' | 'pending_confirmation' | 'failed' | 'skipped'
  outcome    String
  errorMsg   String?
  apiResponse String? // JSON da resposta da API externa

  rule AutomationRule @relation(fields: [ruleId], references: [id], onDelete: Cascade)

  @@index([ruleId])
  @@index([campaignId])
  @@index([executedAt])
}

/// Teste A/B de criativos para uma campanha.
model AbTest {
  id           String    @id @default(cuid())
  campaignId   String
  status       String    @default("active") // 'active' | 'completed' | 'extended' | 'timeout'
  startedAt    DateTime  @default(now())
  endedAt      DateTime?
  winnerAdId   String?   // externalAdId da variação vencedora
  // JSON array de AbTestVariation
  variationsJson String
  // Resumo do resultado gerado pela IA após encerramento
  resultSummary  String?
  extensionCount Int      @default(0) // quantas extensões de 24h foram aplicadas

  campaign AdCampaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)

  @@index([campaignId])
  @@index([status])
}

/// Log de auditoria imutável — registra toda ação automatizada.
/// Registros retidos por no mínimo 12 meses.
model CampaignAuditLog {
  id             String   @id @default(cuid())
  companyId      String
  campaignId     String?
  actionType     String   // ver AuditActionType
  source         String   // 'rule_engine' | 'ab_test' | 'budget_manager' | 'performance_monitor' | 'user'
  previousValues String?  // JSON
  newValues      String?  // JSON
  metadata       String?  // JSON (contexto extra)
  // Campos de confirmação (apenas ações acima do threshold)
  requiresConfirmation Boolean  @default(false)
  userDecision         String?  // 'approved' | 'rejected' | null
  userDecisionAt       DateTime?
  createdAt            DateTime @default(now())

  company  Company     @relation(fields: [companyId], references: [id], onDelete: Cascade)
  campaign AdCampaign? @relation(fields: [campaignId], references: [id], onDelete: SetNull)

  @@index([companyId])
  @@index([companyId, actionType])
  @@index([companyId, createdAt])
  @@index([campaignId])
}
```

### Relações a adicionar nos modelos existentes

```prisma
// Em Company — adicionar:
adCredentials AdPlatformCredential[]
adCampaigns   AdCampaign[]
automationRules AutomationRule[]
campaignAuditLogs CampaignAuditLog[]
```

---

## Interfaces TypeScript dos Serviços

### `credential.service.ts`

```typescript
// src/server/services/credential.service.ts

export type AdPlatform = 'meta' | 'google';

export interface RawCredentialData {
  // Meta Ads
  appId?: string;
  appSecret?: string;
  accessToken?: string;
  adAccountId?: string;
  // Google Ads
  developerToken?: string;
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  customerId?: string;
}

export interface DecryptedCredential {
  platform: AdPlatform;
  fields: Record<string, string>;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  invalidFields?: string[];
}

export interface CredentialService {
  save(
    companyId: string,
    platform: AdPlatform,
    data: RawCredentialData,
  ): Promise<AdPlatformCredential>;

  get(
    companyId: string,
    platform: AdPlatform,
  ): Promise<DecryptedCredential>;

  delete(companyId: string, platform: AdPlatform): Promise<void>;

  validate(
    companyId: string,
    platform: AdPlatform,
  ): Promise<ValidationResult>;
}
```

### `campaign.service.ts`

```typescript
// src/server/services/campaign.service.ts

export interface BrandProfile {
  name: string;
  description?: string | null;
  sector?: string | null;
  objective?: string | null;
  tone: string;
  colors?: string | null;
}

export interface AudienceSegmentation {
  ageMin: number;
  ageMax: number;
  locations: string[];
  interests: string[];
  behaviors: string[];
}

export interface AdCopy {
  placement: string;
  variations: string[];        // mínimo 3
  headlines?: string[];        // mínimo 5 para Google RSA
  descriptions?: string[];     // mínimo 3 para Google RSA
}

export interface Keyword {
  text: string;
  intent: 'informational' | 'navigational' | 'transactional';
  matchType: 'broad' | 'phrase' | 'exact';
}

export interface CampaignDraft {
  objective: string;
  audience: AudienceSegmentation;
  dailyBudgetBrl: number;
  adCopies: AdCopy[];
  creativeBrief: string;
  keywords?: Keyword[];
}

export interface CampaignService {
  generate(
    companyId: string,
    description: string,
  ): Promise<CampaignDraft>;

  launch(
    companyId: string,
    draft: CampaignDraft,
    platforms: AdPlatform[],
  ): Promise<AdCampaign[]>;

  listByCompany(
    companyId: string,
    options?: { page?: number; pageSize?: number; status?: string },
  ): Promise<PaginatedResult<AdCampaignWithLatestMetrics>>;

  getPerformanceReport(
    companyId: string,
    campaignId: string,
    since: Date,
    until: Date,
  ): Promise<PerformanceReport>;
}

export interface AdCampaignWithLatestMetrics extends AdCampaign {
  latestMetrics?: AdMetricSnapshot | null;
}

export interface PerformanceReport {
  campaign: AdCampaign;
  snapshots: AdMetricSnapshot[];
  aiSummary: string;
  recommendations: string[];
}
```

### `meta-ads.connector.ts`

```typescript
// src/server/lib/meta-ads.connector.ts

export interface MetaCampaignResult {
  externalCampaignId: string;
  externalAdSetId: string;
  externalAdIds: string[];
  managerUrl: string;
}

export interface AdMetrics {
  impressions: number;
  clicks: number;
  conversions: number;
  spendBrl: number;
  ctr: number;
  cpc: number;
  roas: number;
  rawJson: string;
}

export interface MetaAdsConnector {
  validateCredentials(creds: DecryptedCredential): Promise<ValidationResult>;

  createCampaign(
    creds: DecryptedCredential,
    draft: CampaignDraft,
  ): Promise<MetaCampaignResult>;

  getMetrics(
    creds: DecryptedCredential,
    externalCampaignId: string,
    since: Date,
    until: Date,
  ): Promise<AdMetrics>;

  pauseAd(creds: DecryptedCredential, externalAdId: string): Promise<void>;

  pauseAdSet(creds: DecryptedCredential, externalAdSetId: string): Promise<void>;

  updateAdSetBudget(
    creds: DecryptedCredential,
    externalAdSetId: string,
    dailyBudgetCents: number,
  ): Promise<void>;
}
```

### `google-ads.connector.ts`

```typescript
// src/server/lib/google-ads.connector.ts

export interface GoogleCampaignResult {
  externalCampaignId: string;
  externalAdGroupId: string;
  externalAdIds: string[];
  managerUrl: string;
}

export interface GoogleAdsConnector {
  validateCredentials(creds: DecryptedCredential): Promise<ValidationResult>;

  createSearchCampaign(
    creds: DecryptedCredential,
    draft: CampaignDraft,
  ): Promise<GoogleCampaignResult>;

  createDisplayCampaign(
    creds: DecryptedCredential,
    draft: CampaignDraft,
  ): Promise<GoogleCampaignResult>;

  getMetrics(
    creds: DecryptedCredential,
    externalCampaignId: string,
    since: Date,
    until: Date,
  ): Promise<AdMetrics>;

  pauseAd(creds: DecryptedCredential, externalAdId: string): Promise<void>;

  updateCampaignBudget(
    creds: DecryptedCredential,
    externalCampaignId: string,
    dailyBudgetMicros: number,
  ): Promise<void>;
}
```

### `performance-monitor.service.ts`

```typescript
// src/server/services/performance-monitor.service.ts

export interface MonitorCycleResult {
  companiesProcessed: number;
  campaignsChecked: number;
  snapshotsSaved: number;
  campaignsFailed: string[]; // IDs das campanhas com falha na coleta
  rulesEvaluated: number;
  actionsExecuted: number;
  abTestsFinalized: number;
  reportsGenerated: number;
}

export interface PerformanceMonitorService {
  runCycle(): Promise<MonitorCycleResult>;

  collectMetrics(
    campaign: AdCampaign,
    creds: DecryptedCredential,
  ): Promise<AdMetricSnapshot | null>;

  generatePerformanceReport(
    companyId: string,
    snapshots: AdMetricSnapshot[],
  ): Promise<string>; // texto em português
}
```

### `automation-rules.service.ts`

```typescript
// src/server/services/automation-rules.service.ts

export interface AutomationRuleCondition {
  metric: 'cpc' | 'ctr' | 'roas' | 'totalCost' | 'conversions';
  operator: 'gt' | 'lt' | 'eq';
  value: number;
}

export interface AutomationRuleAction {
  type: 'pause_ad' | 'pause_adset' | 'increase_budget' | 'replace_creative';
  budgetIncreasePercent?: number;
}

export interface CreateRuleInput {
  companyId: string;
  campaignId?: string;
  name: string;
  condition: AutomationRuleCondition;
  action: AutomationRuleAction;
}

export type RuleExecutionOutcome =
  | { status: 'executed'; apiResponse: unknown }
  | { status: 'pending_confirmation'; pendingAuditLogId: string }
  | { status: 'failed'; error: string }
  | { status: 'skipped'; reason: string };

export interface AutomationRulesService {
  create(input: CreateRuleInput): Promise<AutomationRule>;

  listByCompany(
    companyId: string,
  ): Promise<AutomationRule[]>;

  evaluate(
    companyId: string,
    metrics: Map<string, AdMetricSnapshot>,
  ): Promise<RuleEvaluationResult[]>;

  execute(
    result: RuleEvaluationResult,
    creds: DecryptedCredential,
  ): Promise<RuleExecutionOutcome>;
}

export interface RuleEvaluationResult {
  rule: AutomationRule;
  campaignId: string;
  satisfied: boolean;
  currentMetricValue: number;
  action: AutomationRuleAction;
  projectedNewBudgetBrl?: number;
  requiresConfirmation: boolean; // true se projectedNewBudgetBrl > 500
}
```

### `budget-intelligence.service.ts`

```typescript
// src/server/services/budget-intelligence.service.ts

export interface BudgetAllocation {
  campaignId: string;
  campaignName: string;
  platform: string;
  currentDailyBudgetBrl: number;
  recommendedDailyBudgetBrl: number;
  changePercent: number;
  justification: string;
  dataConfidence: 'sufficient' | 'insufficient'; // <7 dias = insufficient
}

export interface BudgetRecommendation {
  allocations: BudgetAllocation[];
  totalCurrentBrl: number;
  totalRecommendedBrl: number;
  generatedAt: Date;
  aiSummary: string;
}

export interface ApplyBudgetInput {
  companyId: string;
  allocations: Array<{
    campaignId: string;
    newDailyBudgetBrl: number;
  }>;
}

export interface BudgetIntelligenceService {
  getRecommendations(companyId: string): Promise<BudgetRecommendation>;

  apply(
    input: ApplyBudgetInput,
    userId: string,
  ): Promise<{ applied: number; pendingConfirmation: number }>;
}
```

### `ab-test.service.ts`

```typescript
// src/server/services/ab-test.service.ts

export interface AdCreative {
  imageUrl?: string;
  headline: string;
  description: string;
  callToAction: string;
}

export interface AbTestVariation {
  externalAdId: string;
  variationIndex: number; // 1, 2 ou 3
  creative: AdCreative;
  impressions: number;
  clicks: number;
  ctr: number;
  isWinner: boolean;
}

export interface AbTestResult {
  testId: string;
  campaignId: string;
  winner: AbTestVariation;
  allVariations: AbTestVariation[];
  endedAt: Date;
  reason: 'completed' | 'timeout'; // timeout = 7 dias sem 100 impressões
  summary: string;
}

export interface AbTestService {
  createVariations(
    companyId: string,
    campaignId: string,
    originalCreative: AdCreative,
    creds: DecryptedCredential,
  ): Promise<AbTest>;

  checkAndFinalize(
    test: AbTest,
    currentMetrics: Map<string, AbTestVariation>,
    creds: DecryptedCredential,
  ): Promise<AbTestResult | null>;

  selectWinner(variations: AbTestVariation[]): AbTestVariation;
}
```

### `credential-crypto.ts` (lib)

```typescript
// src/server/lib/credential-crypto.ts
// AES-256-GCM. Chave derivada de CREDENTIAL_ENCRYPTION_KEY (hex 64 chars = 32 bytes).

export interface EncryptedBlob {
  iv: string;   // hex — 16 bytes aleatórios por operação (nunca reutilizados)
  tag: string;  // hex — tag de autenticação GCM (16 bytes)
  data: string; // hex — ciphertext
}

export function encryptCredential(plaintext: string): EncryptedBlob;
export function decryptCredential(blob: EncryptedBlob): string;
export function serializeBlob(blob: EncryptedBlob): string; // JSON.stringify
export function deserializeBlob(json: string): EncryptedBlob; // JSON.parse + validação
```

### Plan Guard (lib)

```typescript
// src/server/lib/plan-guard.ts
const TRAFFIC_ALLOWED_PLANS = ['Profissional', 'Agencia'] as const;

// Lança ForbiddenError se o usuário não tiver plano habilitado.
// Chamado no início de cada handler de rota do módulo.
export async function requireTrafficAccess(userId: string): Promise<void>;
```

---

## Rotas de API

Todas as rotas residem em `src/app/api/paid-traffic/` e seguem o padrão do App Router do Next.js. Cada handler:

1. Autentica a sessão via `getServerSession(authOptions)`.
2. Chama `requireTrafficAccess(userId)` (plano guard).
3. Delega ao serviço correspondente.
4. Retorna `NextResponse.json()` com status HTTP adequado.
5. Erros são capturados pelo wrapper `withErrorHandler` que converte `AppError` em resposta JSON estruturada.

### Credenciais

```typescript
// POST /api/paid-traffic/credentials
// Body: { platform: 'meta' | 'google', ...RawCredentialData }
// Resposta 201: { id, platform, isValid, validatedAt }
// Resposta 400: credenciais inválidas na API externa
// Resposta 403: plano não autorizado

// DELETE /api/paid-traffic/credentials/[platform]
// Param: platform = 'meta' | 'google'
// Resposta 204: sem corpo
// Resposta 404: credencial não encontrada
```

### Campanhas

```typescript
// POST /api/paid-traffic/campaigns/generate
// Body: { description: string }
// Resposta 200: CampaignDraft (rascunho para revisão no frontend)
// Resposta 502: falha no AWS Bedrock

// POST /api/paid-traffic/campaigns
// Body: { draft: CampaignDraft, platforms: ('meta' | 'google')[] }
// Resposta 201: AdCampaign[] (uma entrada por plataforma)
// Resposta 400: plataforma sem credenciais cadastradas

// GET /api/paid-traffic/campaigns
// Query: page, pageSize, status
// Resposta 200: { data: AdCampaignWithLatestMetrics[], total, page, pageSize }

// GET /api/paid-traffic/campaigns/[id]/performance
// Query: since (ISO date), until (ISO date)
// Resposta 200: PerformanceReport
```

### Regras de Automação

```typescript
// POST /api/paid-traffic/rules
// Body: CreateRuleInput
// Resposta 201: AutomationRule

// GET /api/paid-traffic/rules
// Query: campaignId? (filtra por campanha)
// Resposta 200: AutomationRule[]
```

### Inteligência de Orçamento

```typescript
// GET /api/paid-traffic/budget-intelligence
// Resposta 200: BudgetRecommendation

// POST /api/paid-traffic/budget-intelligence/apply
// Body: ApplyBudgetInput
// Resposta 200: { applied: number, pendingConfirmation: number }
// Nota: alocações acima de R$500/dia ficam pendentes de confirmação explícita
```

### Auditoria

```typescript
// GET /api/paid-traffic/audit
// Query: campaignId?, actionType?, since?, until?, page, pageSize
// Resposta 200: { data: CampaignAuditLog[], total, page, pageSize }
```

### Cron Job

```typescript
// GET /api/cron/paid-traffic-monitor
// Header: Authorization: Bearer <CRON_SECRET>
// Chamado a cada 6h pelo scheduler (Vercel Cron ou cron externo)
// Resposta 200: MonitorCycleResult
// Resposta 401: token inválido
```

---

## Hierarquia de Componentes Frontend

```
src/
└── app/
    └── (dashboard)/
        └── paid-traffic/
            ├── page.tsx                        ← Dashboard principal
            ├── new/
            │   └── page.tsx                    ← Wizard de criação
            ├── credentials/
            │   └── page.tsx                    ← Conexão de contas
            ├── rules/
            │   └── page.tsx                    ← Gerenciar regras
            ├── budget/
            │   └── page.tsx                    ← Inteligência de orçamento
            └── audit/
                └── page.tsx                    ← Log de auditoria

src/
└── client/
    └── components/
        └── paid-traffic/
            ├── PlanGateGuard.tsx               ← HOC: bloqueia se plano inválido
            │
            ├── dashboard/
            │   ├── CampaignListTable.tsx        ← Tabela de campanhas com métricas
            │   ├── CampaignMetricsBadge.tsx     ← CTR, CPC, ROAS inline
            │   └── PerformanceAlertBanner.tsx   ← Notificações de novas recomendações
            │
            ├── wizard/
            │   ├── CampaignWizard.tsx           ← Orquestra os 3 passos
            │   ├── StepDescribeGoal.tsx         ← Passo 1: textarea de descrição
            │   ├── StepReviewAiDraft.tsx        ← Passo 2: edição do rascunho da IA
            │   └── StepSelectPlatform.tsx       ← Passo 3: seleção Meta/Google/ambos
            │
            ├── credentials/
            │   ├── MetaAdsForm.tsx              ← Formulário de credenciais Meta
            │   ├── GoogleAdsForm.tsx            ← Formulário de credenciais Google
            │   └── CredentialStatusCard.tsx     ← Status de conexão por plataforma
            │
            ├── rules/
            │   ├── RuleList.tsx                 ← Listagem de regras ativas
            │   ├── RuleCreateForm.tsx           ← Formulário condition + action
            │   └── RuleExecutionHistory.tsx     ← Histórico de execuções
            │
            ├── budget/
            │   ├── BudgetComparisonTable.tsx    ← Atual vs. recomendado lado a lado
            │   ├── BudgetConfirmModal.tsx       ← Modal de confirmação (>R$500/dia)
            │   └── BudgetAiJustification.tsx    ← Exibe justificativa da IA
            │
            └── audit/
                ├── AuditLogTable.tsx            ← Tabela com filtros
                └── AuditLogFilters.tsx          ← Filtros por campanha/tipo/período
```

### Fluxo de Dados no Frontend

- Estado local via `useState`/`useReducer` em componentes de formulário.
- Dados remotos via `SWR` ou `fetch` direto em Server Components onde possível.
- O wizard de criação usa estado local elevado em `CampaignWizard.tsx`.
- `PlanGateGuard.tsx` wraps todo o layout de `paid-traffic/` e faz redirect para página de upgrade se o plano não for elegível.

---

## Diagramas de Sequência

### Fluxo 1: Criação de Campanha com IA

```
Usuário           Browser           API Route                  Services            AWS Bedrock / Ext. APIs
   │                 │                  │                          │                        │
   │  Descreve       │                  │                          │                        │
   │  objetivo  ────►│                  │                          │                        │
   │                 │  POST /campaigns/generate                   │                        │
   │                 │─────────────────►│                          │                        │
   │                 │                  │ requireTrafficAccess()   │                        │
   │                 │                  │─────────────────────────►│                        │
   │                 │                  │ campaignService.generate()                        │
   │                 │                  │─────────────────────────►│                        │
   │                 │                  │                          │ generateTextWithBedrock │
   │                 │                  │                          │────────────────────────►
   │                 │                  │                          │◄────────────────────────
   │                 │                  │                          │  CampaignDraft (JSON)  │
   │                 │                  │◄─────────────────────────│                        │
   │                 │◄─────────────────│  200 CampaignDraft       │                        │
   │  Revisa e       │                  │                          │                        │
   │  edita draft ───►                  │                          │                        │
   │  Seleciona      │                  │                          │                        │
   │  plataforma ────►                  │                          │                        │
   │                 │  POST /campaigns │                          │                        │
   │                 │─────────────────►│                          │                        │
   │                 │                  │ campaignService.launch() │                        │
   │                 │                  │─────────────────────────►│                        │
   │                 │                  │                          │ credentialService.get()│
   │                 │                  │                          │─────────────────────── │
   │                 │                  │                          │ metaAdsConnector       │
   │                 │                  │                          │  .createCampaign() ────────────────────►
   │                 │                  │                          │                        │ Meta API
   │                 │                  │                          │◄────────────────────────────────────────
   │                 │                  │                          │  { externalCampaignId, managerUrl }
   │                 │                  │                          │ auditService.log('campaign_created')
   │                 │                  │◄─────────────────────────│                        │
   │                 │◄─────────────────│  201 AdCampaign[]        │                        │
   │  Vê link ◄──────│                  │                          │                        │
   │  para plataforma│                  │                          │                        │
```

### Fluxo 2: Ciclo de Monitoramento de Performance (Cron a cada 6h)

```
Scheduler         /api/cron/          performanceMonitor      Connector         Claude Bedrock
   │              paid-traffic-monitor    Service                │                   │
   │                    │                   │                    │                   │
   │  GET (Bearer) ─────►                   │                    │                   │
   │                    │  validateCronSecret                    │                   │
   │                    │  runCycle() ──────►                    │                   │
   │                    │                   │                    │                   │
   │                    │            para cada campanha ativa:   │                   │
   │                    │                   │  collectMetrics()  │                   │
   │                    │                   │───────────────────►│                   │
   │                    │                   │                    │─── getMetrics() ──►
   │                    │                   │                    │ (Meta/Google API) │
   │                    │                   │                    │◄──────────────────│
   │                    │                   │◄───────────────────│                   │
   │                    │                   │  AdMetricSnapshot  │                   │
   │                    │                   │  salva no banco    │                   │
   │                    │                   │                    │                   │
   │                    │            automationRulesService.evaluate()               │
   │                    │                   │─── (avalia condições vs. métricas) ──► │
   │                    │                   │  se ação < threshold: execute() via API│
   │                    │                   │  se ação > threshold: pendingConfirm   │
   │                    │                   │                    │                   │
   │                    │            abTestService.checkAndFinalize()                │
   │                    │                   │─── (48h + 100 impressões?) ──────────►│
   │                    │                   │  se sim: pausar perdedores             │
   │                    │                   │                    │                   │
   │                    │            generatePerformanceReport()  │                   │
   │                    │                   │────────────────────────────────────────►
   │                    │                   │                    │  Claude Sonnet 4  │
   │                    │                   │◄────────────────────────────────────────
   │                    │                   │  relatório em PT   │                   │
   │                    │                   │  notifica usuário  │                   │
   │                    │◄──────────────────│  MonitorCycleResult│                   │
   │◄───────────────────│  200 { result }   │                    │                   │
```

### Fluxo 3: Execução de Regra de Automação

```
Monitor Cycle     automationRules       Connector         auditService     Notificação
   │                 Service               │                   │               │
   │                    │                  │                   │               │
   │  evaluate(metrics)─►                  │                   │               │
   │                    │  para cada regra:│                   │               │
   │                    │  condição satisfeita?                │               │
   │                    │  ────────────────────────────────    │               │
   │                    │  action.type = 'pause_ad'?           │               │
   │                    │                  │                   │               │
   │                    │  execute(result) │                   │               │
   │                    │─────────────────►│                   │               │
   │                    │                  │─── pauseAd() ────►│               │
   │                    │                  │    (API externa)  │               │
   │                    │                  │                   │               │
   │                    │  se API OK:      │                   │               │
   │                    │◄─────────────────│                   │               │
   │                    │  log('executed') │                   │               │
   │                    │─────────────────────────────────────►│               │
   │                    │                  │                   │               │
   │                    │  action.type = 'increase_budget'     │               │
   │                    │  projectedBudget > R$500?            │               │
   │                    │  ────────────────────────────────    │               │
   │                    │                  │                   │               │
   │                    │  SIM: pendingConfirmation            │               │
   │                    │  log('budget_change_requested') ─────►               │
   │                    │                  │                   │  notifica ────►
   │                    │                  │                   │  usuário      │
   │                    │                  │                   │               │
   │                    │  NÃO: execute updateBudget()         │               │
   │                    │─────────────────►│                   │               │
   │                    │◄─────────────────│                   │               │
   │                    │  log('budget_increased') ────────────►               │
   │                    │                  │                   │               │
   │                    │  se API falhou:  │                   │               │
   │                    │  log('rule_failed') ─────────────────►               │
   │                    │                  │                   │  notifica ────►
   │                    │                  │                   │  erro         │
```

---

## Considerações de Segurança

### Criptografia de Credenciais

- **Algoritmo:** AES-256-GCM (autenticado — protege contra adulteração).
- **Chave:** 32 bytes, derivada de `CREDENTIAL_ENCRYPTION_KEY` (env var, hex 64 chars). Nunca commitada.
- **IV:** 16 bytes aleatórios gerados por operação (`crypto.randomBytes(16)`). Nunca reutilizados.
- **Armazenamento:** campo `encryptedData` no banco como JSON serializado `{ iv, tag, data }`.
- **Acesso:** apenas funções internas dos connectors recebem `DecryptedCredential`. Nunca exposto via API ou logs.
- **Logs:** o `logger.ts` existente já redact campos com `token`, `secret`, `key`. Credential fields passam por esse filtro automaticamente.

### Controle de Acesso

- Todas as rotas de `/api/paid-traffic/*` executam `requireTrafficAccess(userId)` antes de qualquer lógica.
- Cada query ao banco filtra por `companyId` derivado da sessão autenticada — isolamento multi-tenant estrito.
- O cron endpoint `/api/cron/paid-traffic-monitor` aceita apenas requisições com `Authorization: Bearer <CRON_SECRET>`. A secret é uma env var separada, nunca exposta ao cliente.

### Proteção Financeira

- **Threshold de confirmação:** R$500/dia. Qualquer ação automática que resulte em orçamento diário acima desse valor exige confirmação explícita do usuário antes de ser executada.
- **Auditoria imutável:** `CampaignAuditLog` nunca é deletado (apenas retido por ≥12 meses). Registra tanto a solicitação quanto a decisão do usuário para ações acima do threshold.

### Proteção contra Enumeração

- IDs de campanha nos endpoints são validados contra o `companyId` da sessão. Um usuário não pode consultar campanhas de outra empresa mesmo conhecendo o ID.

---

## Estratégia de Testes

### Testes Unitários

- `credential-crypto.ts`: teste de encrypt/decrypt round-trip, unicidade de IVs, detecção de adulteração (tag inválida).
- `automation-rules.service.ts`: avaliação de cada combinação de operador/métrica, lógica de threshold.
- `ab-test.service.ts`: seleção de vencedor por CTR, lógica de extensão de 24h, encerramento por timeout.
- `budget-intelligence.service.ts`: cálculo de redistribuição, flag de dados insuficientes (<7 dias).

### Testes de Integração

- `meta-ads.connector.ts` e `google-ads.connector.ts` são testados com mocks das APIs externas (MSW ou jest.mock).
- Fluxo completo de `campaign.service.generate()` → `launch()` com mock do Bedrock e dos connectors.
- Cron job `/api/cron/paid-traffic-monitor`: ciclo completo com banco SQLite em memória.

### Testes de Propriedade (Property-Based)

- **Invariante de criptografia:** `∀ plaintext: decrypt(encrypt(plaintext)) === plaintext`
- **Invariante de seleção de vencedor:** `∀ variations não-vazias: winner.ctr === max(variations.map(v => v.ctr))`
- **Invariante de threshold:** `∀ rule execution: projectedBudget > 500 → requiresConfirmation === true`

**Biblioteca:** `fast-check` (já compatível com o ecossistema Jest do projeto).

---

## Dependências Externas

| Dependência | Versão sugerida | Uso |
|---|---|---|
| `facebook-nodejs-business-sdk` | `^20.0.0` | Meta Marketing API |
| `google-ads-api` | `^16.0.0` | Google Ads API v19 |
| `fast-check` | `^3.x` | Property-based tests |

> As dependências AWS (já presentes: `@aws-sdk/client-bedrock-runtime`) continuam sendo usadas sem alteração.

---

## Estrutura de Arquivos Novos

```
src/
├── app/
│   ├── (dashboard)/
│   │   └── paid-traffic/
│   │       ├── page.tsx
│   │       ├── new/page.tsx
│   │       ├── credentials/page.tsx
│   │       ├── rules/page.tsx
│   │       ├── budget/page.tsx
│   │       └── audit/page.tsx
│   └── api/
│       ├── paid-traffic/
│       │   ├── credentials/
│       │   │   ├── route.ts           ← POST
│       │   │   └── [platform]/
│       │   │       └── route.ts       ← DELETE
│       │   ├── campaigns/
│       │   │   ├── route.ts           ← GET, POST
│       │   │   ├── generate/
│       │   │   │   └── route.ts       ← POST
│       │   │   └── [id]/
│       │   │       └── performance/
│       │   │           └── route.ts   ← GET
│       │   ├── rules/
│       │   │   └── route.ts           ← GET, POST
│       │   ├── budget-intelligence/
│       │   │   ├── route.ts           ← GET
│       │   │   └── apply/
│       │   │       └── route.ts       ← POST
│       │   └── audit/
│       │       └── route.ts           ← GET
│       └── cron/
│           └── paid-traffic-monitor/
│               └── route.ts           ← GET
├── client/
│   └── components/
│       └── paid-traffic/
│           └── (ver hierarquia acima)
└── server/
    ├── lib/
    │   ├── credential-crypto.ts       ← NOVO
    │   ├── meta-ads.connector.ts      ← NOVO
    │   ├── google-ads.connector.ts    ← NOVO
    │   └── plan-guard.ts             ← NOVO
    └── services/
        ├── campaign.service.ts        ← NOVO
        ├── credential.service.ts      ← NOVO
        ├── performance-monitor.service.ts ← NOVO
        ├── automation-rules.service.ts    ← NOVO
        ├── budget-intelligence.service.ts ← NOVO
        └── ab-test.service.ts         ← NOVO
```
