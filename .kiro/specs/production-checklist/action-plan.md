# Plano de Ação — Qualidade do Código

## Fase 1: Limpeza Imediata (quick wins)

- [x] Remover diretório vazio `src/client/hooks/`
- [x] Consolidar teste duplicado `company.service.test.ts` → movido para `services/company-multi.service.test.ts`
- [x] Renomear `promptTranslator.ts` → `promptTranslator.service.ts`
- [x] Corrigir erros TS pré-existentes em `cost.service.test.ts`
- [x] Verificar "duplicatas" de rotas API — confirmado que NÃO são duplicatas (propósitos distintos)
- [x] Verificar "duplicata" de UploadDropzone — confirmado que NÃO é duplicata (APIs diferentes)

**Resultado:** 0 erros TypeScript, 402 testes passando.

---

## Fase 2: Refatoração de Páginas Monolíticas

Extrair lógica e UI das páginas grandes para componentes e hooks reutilizáveis.

| Página | Tamanho | Ação |
|--------|---------|------|
| `create-post/page.tsx` | 67.8 KB | Extrair em CreatePostWizard, TextGenerator, ImageGenerator, hooks |
| `knowledge-base/[id]/agent/page.tsx` | 27.3 KB | Extrair lógica para KBAgentEditor component |
| `knowledge-base/[id]/records/page.tsx` | 25.6 KB | Extrair RecordsList, RecordForm components |
| `social/page.tsx` | 24.9 KB | Extrair SocialAccountCard, ConnectionFlow components |
| `costs/page.tsx` | 22.8 KB | Extrair CostChart, CostTable components |
| `posts/page.tsx` | 22.4 KB | Extrair PostList, PostFilters components |
| `onboarding/page.tsx` | 21.7 KB | Extrair OnboardingSteps, CompanyForm components |

Prioridade: `create-post` primeiro (maior e mais usado).

---

## Fase 3: Corrigir Arquitetura DDD (Services sem Repository)

Criar repositories para os services que acessam Prisma diretamente. Prioridade por módulo:

### Alta prioridade (funcionalidades core) ✅ CONCLUÍDA
- [x] Criado `credential.repository.ts` — todas as operações de AdPlatformCredential
- [x] Criado `boost.repository.ts` — CampaignAuditLog + AdCampaign para boost
- [x] Estendido `company.repository.ts` — adicionado `findByIdForPrompt()`
- [x] Estendido `post.repository.ts` — adicionado `findInstagramPosts()`, `updateGridOrder()`, `updateBoostSuggestion()`, `updateBoostCampaignId()`
- [x] Refatorado `credential.service.ts` — agora usa credentialRepository
- [x] Refatorado `boost.service.ts` — agora usa companyRepository, postRepository, credentialRepository, boostRepository
- [x] Refatorado `profile-auditor.service.ts` — agora usa companyRepository
- [x] Refatorado `bio.service.ts` — agora usa companyRepository
- [x] Refatorado `feed-grid.service.ts` — agora usa postRepository

**Resultado:** Services com acesso direto ao Prisma: 23 → **9** (redução de 61%)

Services restantes com Prisma direto (large/complex, prioridade menor):
- campaign.service.ts, ab-test.service.ts, budget-intelligence.service.ts
- automation-rules.service.ts, performance-monitor.service.ts
- video-job.service.ts, narration.service.ts
- kbAgent.service.ts, strategic-analyst.service.ts

---

## Fase 4: Decomposição de Services Grandes

Services acima de 15 KB devem ser divididos por responsabilidade:

### ✅ Concluído
- [x] `campaign.service.ts` (27.4 KB) → dividido em 4 sub-módulos:
  - `campaign/campaign-generation.service.ts` — geração de draft via Bedrock
  - `campaign/campaign-launch.service.ts` — integração com plataformas
  - `campaign/campaign-reporting.service.ts` — relatórios de performance via IA
  - `campaign/campaign-query.service.ts` — listagem paginada
  - `campaign/campaign.types.ts` — types compartilhados
  - `campaign/index.ts` — barrel com facade `campaignService`
  - `campaign.service.ts` — re-export para manter compatibilidade

- [x] `ab-test.service.ts` (26.3 KB) → dividido em 5 sub-módulos:
  - `ab-test/ab-test.types.ts` — types e constantes
  - `ab-test/ab-test-prompts.ts` — prompt builders e parser
  - `ab-test/ab-test-analysis.service.ts` — lógica de decisão (selectWinner, evaluateTest)
  - `ab-test/ab-test-executor.service.ts` — execução em plataformas
  - `ab-test/ab-test-crud.service.ts` — CRUD e orquestração
  - `ab-test/index.ts` — barrel
  - `ab-test.service.ts` — facade

- [x] `automation-rules.service.ts` (21.2 KB) → dividido em 4 sub-módulos:
  - `automation-rules/automation-rules.types.ts` — types
  - `automation-rules/automation-rules-engine.service.ts` — evaluate + helpers
  - `automation-rules/automation-rules-executor.service.ts` — execute (4 action types)
  - `automation-rules/index.ts` — barrel com create + listByCompany
  - `automation-rules.service.ts` — facade

### Pendente (próxima iteração)
- [ ] `video-job.service.ts` (22.4 KB) → video-job-crud, video-pipeline, video-credit
- [ ] `video-assembler.service.ts` (19.9 KB) → assembler-core, assembler-ai-frames, assembler-polish
- [ ] `ReelGallerySection.tsx` (31.1 KB) → ReelGrid, ReelPreview, ReelActions

---

## Fase 5: Cobertura de Testes

Meta: alcançar os thresholds configurados (80% stmts, 60% branches, 80% lines, 80% functions).

**STATUS: ✅ CONCLUÍDA (Prioridade 1)**

Resultado após a Fase 5:
| Métrica | Antes | Depois | Meta | Status |
|---------|-------|--------|------|--------|
| Statements | 50.11% | **85.99%** | 80% | ✅ |
| Branches | 41.51% | **70.51%** | 60% | ✅ |
| Functions | 50.64% | **93.03%** | 80% | ✅ |
| Lines | 51.59% | **88.48%** | 80% | ✅ |

Testes: 402 → **503** (+101 testes novos, 32 suites)

### Prioridade 1 — Services core sem teste nenhum ✅
- [x] agent.service.ts (85.86% stmts)
- [x] conversation.service.ts (100%)
- [x] knowledgeBase.service.ts (94.33%)
- [x] kbAgent.service.ts (87.61%)
- [x] catalogField.service.ts (71.18%)
- [x] catalogRecord.service.ts (86.44%)
- [x] schemaInferrer.service.ts (89.58%)
- [x] searchTool.service.ts (82.27%)

### Prioridade 2 — Services de módulos novos sem teste
- [ ] video-job.service.ts
- [ ] video-assembler.service.ts
- [ ] frame-extractor.service.ts
- [ ] frame-transformer.service.ts
- [ ] narration.service.ts
- [ ] credential.service.ts

### Prioridade 3 — Melhorar cobertura de branches nos existentes
- [ ] company.service.ts (59% branches → 80%)
- [ ] post.service.ts (71% branches → 80%)
- [ ] boost.service.ts (61% branches → 80%)
- [ ] strategic-analyst.service.ts (51% branches → 80%)

### Corrigir erro pré-existente
- [x] `cost.service.test.ts` — linhas 130-132 (Object possibly undefined) — CORRIGIDO na Fase 1

---

## Ordem de Execução Recomendada

```
Semana 1:  Fase 1 (limpeza imediata) — 1-2 horas
Semana 2:  Fase 5 Prioridade 1 (testes services core) — 2-3 dias
Semana 3:  Fase 2 (refatorar create-post + social) — 2-3 dias
Semana 4:  Fase 3 alta prioridade (repositories) — 1-2 dias
Semana 5+: Fases 4 e 5 restantes (iterativo)
```

---

## Métricas de Sucesso

| Critério | Início | Atual | Meta |
|----------|--------|-------|------|
| Cobertura statements | 50% | **86%** | 80% ✅ |
| Cobertura branches | 41% | **70%** | 60% ✅ |
| Cobertura functions | 50% | **93%** | 80% ✅ |
| Cobertura lines | 51% | **88%** | 80% ✅ |
| Testes | 402 | **503** | — |
| Erros TypeScript | 3 | **0** | 0 ✅ |
| Services com Prisma direto | 23 | **9** | 0 |
| Services > 15 KB decompostos | 0/6 | **3/6** | 6/6 |
| Duplicações | 5 | **0** | 0 ✅ |
| Maior page.tsx | 67.8 KB | 67.8 KB | < 10 KB |
