# Tasks — Tráfego Pago com IA

## Visão Geral

Implementação incremental do módulo de Tráfego Pago com IA para a MKT Digital Platform.
As tarefas seguem ordem de dependência garantida: fundação sem APIs externas → geração IA → conectores de plataforma → lançamento de campanha → motor de automação → frontend → integração final.

> Tarefas marcadas com `*` são opcionais (testes) e podem ser puladas para um MVP mais rápido.

---

## Fase 1 — Fundação (sem dependências de APIs externas)

- [x] 1. Adicionar novos modelos Prisma ao schema
  - Adicionar os modelos `AdPlatformCredential`, `AdCampaign`, `AdMetricSnapshot`, `AutomationRule`, `RuleExecutionLog`, `AbTest` e `CampaignAuditLog` ao arquivo `prisma/schema.prisma`, conforme definido no documento de design
  - Adicionar relações ao modelo `Company` existente: `adCredentials`, `adCampaigns`, `automationRules` e `campaignAuditLogs`
  - Executar `prisma migrate dev --name add-paid-traffic-module` para aplicar a migração
  - Verificar que todos os índices (`companyId`, `status`, `collectedAt`, `createdAt`) foram criados corretamente
  - _Requisitos: 2.3, 2.4, 4.5, 5.5, 6.7, 7.6, 9.6, 10.1, 10.3_

- [x] 2. Implementar biblioteca de criptografia de credenciais
  - Criar `src/server/lib/credential-crypto.ts` com as funções `encryptCredential(plaintext)`, `decryptCredential(blob)`, `serializeBlob(blob)` e `deserializeBlob(json)` usando AES-256-GCM via módulo nativo `node:crypto`
  - A chave de 32 bytes deve ser derivada da variável de ambiente `CREDENTIAL_ENCRYPTION_KEY` (hex com 64 chars); lançar `ConfigurationError` se ausente ou inválida ao inicializar o módulo
  - Cada chamada a `encryptCredential` deve gerar um novo IV aleatório de 16 bytes via `crypto.randomBytes(16)` — IVs nunca devem ser reutilizados
  - `deserializeBlob` deve validar a presença dos campos `iv`, `tag` e `data` e lançar erro se algum estiver ausente
  - _Requisitos: 2.3, 2.4_

- [x] 3. Implementar `plan-guard.ts`
  - Criar `src/server/lib/plan-guard.ts` com a função `requireTrafficAccess(userId: string): Promise<void>`
  - Buscar a assinatura ativa do usuário via Prisma incluindo o plano associado (`include: { subscription: { include: { plan: true } } }`)
  - Verificar se `plan.name` é `'Profissional'` ou `'Agencia'`; lançar `ForbiddenError` (HTTP 403) com mensagem descritiva em português se o plano não for elegível
  - A verificação deve ocorrer a cada requisição — sem cache
  - _Requisitos: 1.1, 1.2, 1.3, 1.4_

- [x] 4. Implementar `credential.service.ts`
  - Criar `src/server/services/credential.service.ts` implementando a interface `CredentialService` definida no design
  - Método `save(companyId, platform, data)`: serializar `RawCredentialData` como JSON, criptografar via `encryptCredential`, persistir no banco usando upsert por `[companyId, platform]` e retornar o registro criado
  - Método `get(companyId, platform)`: buscar o registro, deserializar o `encryptedData`, descriptografar via `decryptCredential` e retornar `DecryptedCredential`; lançar `NotFoundError` se não existir
  - Método `delete(companyId, platform)`: remover o registro permanentemente; lançar `NotFoundError` se não encontrado
  - Método `validate(companyId, platform, connector)`: chamar `get`, passar `DecryptedCredential` para o conector validar e atualizar `isValid` + `validatedAt` no banco
  - Garantir que nenhum valor descriptografado seja incluído em logs (o `logger.ts` existente já redact campos com `token`, `secret`, `key`)
  - _Requisitos: 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

- [ ]* 5. Testes unitários para `credential-crypto.ts` e `plan-guard.ts`
  - **Propriedade 1: Invariante de criptografia — round-trip**
  - *Para qualquer* string de texto plano, `decryptCredential(encryptCredential(plaintext))` deve retornar exatamente `plaintext`
  - **Valida: Requisito 2.3**
  - Usar `fast-check` (adicionar como devDependency se ainda não estiver em `package.json`) para gerar strings aleatórias de tamanho variado
  - Testar adulteração: modificar o campo `tag` ou `data` no blob criptografado deve lançar erro na descriptografia
  - Testar que dois chamadas a `encryptCredential` com o mesmo plaintext geram IVs diferentes
  - Para `plan-guard.ts`: mockar Prisma e testar que planos `'Profissional'` e `'Agencia'` passam, e qualquer outro lança `ForbiddenError`
  - _Requisitos: 1.1, 1.4, 2.3, 2.4_

---

## Fase 2 — Geração de Campanha com IA

- [x] 6. Implementar `campaign.service.ts` — método `generate`
  - Criar `src/server/services/campaign.service.ts` com o método `generate(companyId: string, description: string): Promise<CampaignDraft>`
  - Buscar o perfil de marca da empresa (`Company`) via Prisma e construir um system prompt enriquecido com nome, setor, objetivo, tom de voz e cores
  - Chamar `generateTextWithBedrock` (já existente em `src/server/lib/bedrock.ts`) com o prompt estruturado solicitando resposta no formato `CampaignDraft` como JSON
  - Parsear e validar a resposta JSON do Claude: garantir presença de `objective`, `audience`, `dailyBudgetBrl`, `adCopies` (com no mínimo 3 variações de copy por posicionamento) e `creativeBrief`
  - Para campanhas Google Search: o draft deve conter `keywords` com no mínimo 15 palavras-chave com `intent` e `matchType`; para RSA: `adCopies` devem ter no mínimo 5 `headlines` e 3 `descriptions`
  - Se `generateTextWithBedrock` lançar erro, relançar como `ServiceUnavailableError` (HTTP 502) — sem método alternativo de geração
  - O perfil de marca deve sempre ser incluído no prompt, mesmo que outros campos da empresa estejam nulos
  - _Requisitos: 3.1, 3.2, 3.3, 3.6, 3.7, 5.2, 5.4_

- [x] 7. Criar rota `POST /api/paid-traffic/campaigns/generate`
  - Criar `src/app/api/paid-traffic/campaigns/generate/route.ts`
  - Autenticar via `getServerSession(authOptions)` (padrão do projeto); chamar `requireTrafficAccess(userId)` logo após
  - Validar body `{ description: string }` — retornar HTTP 400 se ausente ou string vazia
  - Delegar a `campaignService.generate(companyId, description)` e retornar HTTP 200 com `CampaignDraft`
  - Em caso de falha no Bedrock: retornar HTTP 502 com mensagem de erro amigável em português
  - Envolver o handler com `withErrorHandler` (já existente em `src/server/lib/api-handler.ts`)
  - _Requisitos: 3.1, 3.2, 3.4, 3.6_

- [ ]* 8. Testes unitários para `campaign.service.generate`
  - Mockar `generateTextWithBedrock` para retornar um draft válido em formato JSON
  - Testar que o perfil de marca da empresa é injetado corretamente no prompt (verificar que nome, setor e tom de voz aparecem no prompt passado ao Bedrock)
  - Testar que falha no `generateTextWithBedrock` resulta em `ServiceUnavailableError` e não em outro tipo de erro
  - Testar parsing de resposta com JSON malformado (deve lançar erro, não retornar draft parcial)
  - Testar que draft com menos de 3 variações de copy por posicionamento é rejeitado na validação
  - _Requisitos: 3.2, 3.3, 3.6, 3.7_

---

## Fase 3 — Conectores de Plataforma

- [x] 9. Implementar `meta-ads.connector.ts`
  - Instalar `facebook-nodejs-business-sdk@^20.0.0` como dependência de produção
  - Criar `src/server/lib/meta-ads.connector.ts` implementando a interface `MetaAdsConnector` definida no design
  - Método `validateCredentials(creds)`: chamar `GET /v21.0/me?fields=id,name` com o `accessToken`; retornar `ValidationResult`; timeout de 10 segundos via `AbortController`
  - Método `createCampaign(creds, draft)`: criar Campanha → Ad Set (com segmentação de público: `age_min`, `age_max`, `geo_locations`, `interests`, `behaviors` + orçamento diário em centavos + estratégia de lance `LOWEST_COST_WITHOUT_CAP`) → Anúncios (upload de criativos via `adCreatives` API); retornar `MetaCampaignResult` com `externalCampaignId`, `externalAdSetId`, `externalAdIds[]` e `managerUrl`
  - Método `getMetrics(creds, externalCampaignId, since, until)`: chamar Insights API com campos `impressions,clicks,spend,actions,ctr,cpc` e mapear para `AdMetrics`
  - Métodos `pauseAd(creds, externalAdId)`, `pauseAdSet(creds, externalAdSetId)`: chamar `POST /v21.0/{id}` com `{ status: 'PAUSED' }`
  - Método `updateAdSetBudget(creds, externalAdSetId, dailyBudgetCents)`: chamar `POST /v21.0/{id}` com `{ daily_budget: dailyBudgetCents }`
  - Registrar erros detalhados via `logger.error` com etapa de criação e resposta da API antes de lançar exceção
  - _Requisitos: 2.5, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

- [x] 10. Implementar `google-ads.connector.ts`
  - Instalar `google-ads-api@^16.0.0` como dependência de produção
  - Criar `src/server/lib/google-ads.connector.ts` implementando a interface `GoogleAdsConnector` definida no design
  - Método `validateCredentials(creds)`: inicializar cliente Google Ads API v19 com as credenciais OAuth2 e realizar chamada de teste (`customer.get()`) com timeout de 10 segundos; retornar `ValidationResult`
  - Método `createSearchCampaign(creds, draft)`: criar Campanha de Search → Grupo de Anúncios → Palavras-chave (no mínimo 15, segmentadas por intenção com `match_type` mapeado para `BROAD`, `PHRASE` ou `EXACT`) → Anúncio Responsivo de Pesquisa (RSA com no mínimo 5 títulos e 3 descrições em `headlines` e `descriptions`); retornar `GoogleCampaignResult`
  - Método `createDisplayCampaign(creds, draft)`: criar Campanha de Display com criativos gerados pela IA via Google Ads API
  - Métodos `getMetrics`, `pauseAd`, `updateCampaignBudget`: implementar via Google Ads API v19
  - Registrar erros detalhados via `logger.error`; somente após registro bem-sucedido de log lançar a exceção para o chamador
  - _Requisitos: 2.6, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

- [x] 11. Criar rotas de CRUD de credenciais
  - Criar `src/app/api/paid-traffic/credentials/route.ts` — método `POST`:
    - Validar body `{ platform: 'meta' | 'google', ...campos }` (HTTP 400 se plataforma inválida ou campos obrigatórios ausentes)
    - Chamar `credentialService.save` para criptografar e persistir no banco
    - Chamar `credentialService.validate` para acionar o conector correspondente — aguardar até 10 segundos
    - Retornar HTTP 201 com `{ id, platform, isValid, validatedAt }` se válido
    - Retornar HTTP 400 com mensagem de erro descritiva em português indicando qual credencial está inválida, sem expor os valores fornecidos
  - Criar `src/app/api/paid-traffic/credentials/[platform]/route.ts` — método `DELETE`:
    - Chamar `credentialService.delete(companyId, platform)` e retornar HTTP 204 sem corpo
    - Retornar HTTP 404 se a credencial não existir para a plataforma informada
  - Todas as rotas com `getServerSession` + `requireTrafficAccess` + `withErrorHandler`
  - _Requisitos: 2.1, 2.2, 2.3, 2.5, 2.6, 2.7, 2.8_

- [ ]* 12. Testes de integração para conectores (APIs mockadas)
  - Usar `jest.mock` para interceptar chamadas HTTP do `facebook-nodejs-business-sdk` e `google-ads-api`
  - Testar `validateCredentials` com resposta válida (200 com `id`) e inválida (erro de autenticação)
  - Testar `createCampaign` / `createSearchCampaign` verificando que IDs externos corretos são extraídos da resposta mockada
  - Testar que quando a API Meta retorna erro na criação do Ad Set (segunda etapa), o erro é propagado com a etapa identificada
  - Testar que `getMetrics` mapeia corretamente os campos da resposta bruta para `AdMetrics` (incluindo cálculo de `ctr`, `cpc` e `roas`)
  - _Requisitos: 2.5, 2.6, 4.1, 4.5, 4.6, 5.1, 5.5, 5.6_

---

## Fase 4 — Lançamento de Campanha

- [x] 13. Implementar `campaign.service.ts` — método `launch`
  - Adicionar método `launch(companyId, draft, platforms)` ao `campaign.service.ts`
  - Para cada plataforma selecionada: chamar `credentialService.get(companyId, platform)`; lançar `BadRequestError` (HTTP 400) se a credencial não estiver cadastrada para a plataforma
  - Chamar `metaAdsConnector.createCampaign` para Meta Ads; para Google Ads, chamar `createSearchCampaign` ou `createDisplayCampaign` conforme `draft.campaignType`
  - Persistir `AdCampaign` no banco com `externalCampaignId`, `externalAdSetId`, `externalAdIds` (JSON array) e `managerUrl` retornados pelo conector; se a gravação no banco falhar após criação bem-sucedida na plataforma: manter campanha na plataforma, registrar `status: 'error'` no banco e lançar erro com detalhes da inconsistência
  - Registrar `CampaignAuditLog` com `actionType: 'campaign_created'`, `source: 'user'`, `newValues` com os IDs externos criados
  - Após persistência bem-sucedida: chamar `abTestService.createVariations` para iniciar teste A/B automaticamente
  - _Requisitos: 3.5, 4.1, 4.5, 4.5a, 4.6, 4.7, 5.1, 5.5, 5.6, 5.7, 9.1, 9.2, 10.1_

- [x] 14. Criar rotas `POST /api/paid-traffic/campaigns` e `GET /api/paid-traffic/campaigns`
  - Adicionar método `listByCompany(companyId, options)` ao `campaign.service.ts`: paginação via `skip/take` com `page` e `pageSize`; incluir snapshot de métricas mais recente via `include: { metrics: { orderBy: { collectedAt: 'desc' }, take: 1 } }`; suportar filtro opcional por `status`
  - Criar `src/app/api/paid-traffic/campaigns/route.ts`:
    - `POST`: validar body `{ draft: CampaignDraft, platforms: AdPlatform[] }`, chamar `campaignService.launch`, retornar HTTP 201 com `AdCampaign[]`; HTTP 400 se plataforma sem credencial cadastrada
    - `GET`: aceitar query params `page` (default 1), `pageSize` (default 20), `status` (opcional); retornar HTTP 200 com `{ data: AdCampaignWithLatestMetrics[], total, page, pageSize }`
  - _Requisitos: 3.5, 4.7, 5.7, 6.5, 6.6_

- [x] 15. Criar rota `GET /api/paid-traffic/campaigns/[id]/performance`
  - Adicionar método `getPerformanceReport(companyId, campaignId, since, until)` ao `campaign.service.ts`: verificar que a campanha pertence ao `companyId` da sessão (proteção contra enumeração); buscar `AdMetricSnapshot` do período via Prisma; gerar `aiSummary` e `recommendations` chamando `generateTextWithBedrock` com os snapshots como contexto
  - Criar `src/app/api/paid-traffic/campaigns/[id]/performance/route.ts` — `GET`:
    - Validar query params `since` e `until` como datas ISO válidas (HTTP 400 se inválidas)
    - Chamar `campaignService.getPerformanceReport` e retornar HTTP 200 com `PerformanceReport`
    - HTTP 404 se a campanha não existir ou não pertencer à empresa da sessão
  - _Requisitos: 6.5, 6.6_

---

## Fase 5 — Motor de Automação

- [x] 16. Implementar serviço e repositório de regras de automação
  - Criar `src/server/repositories/automation-rules.repository.ts` com métodos: `create(data)`, `findActiveByCompany(companyId)`, `findByCompany(companyId)`, `logExecution(data: RuleExecutionLog)`
  - Criar `src/server/services/automation-rules.service.ts` implementando `AutomationRulesService`
  - Método `create(input)`: serializar `condition` e `action` como JSON, persistir via repositório
  - Método `evaluate(companyId, metrics)`: para cada regra ativa, recuperar `currentMetricValue` do snapshot correspondente e aplicar o operador (`gt`, `lt`, `eq`); calcular `projectedNewBudgetBrl` se ação for `increase_budget`; definir `requiresConfirmation: true` se `projectedNewBudgetBrl > 500`
  - Método `execute(result, creds)`: para `pause_ad` ou `pause_adset` — chamar API e registrar `RuleExecutionLog` somente após sucesso da chamada de API; para `increase_budget ≤ R$500` — executar e registrar; para `increase_budget > R$500` — criar `CampaignAuditLog` com `requiresConfirmation: true` e retornar `pending_confirmation` sem executar a ação
  - Para ação `replace_creative`: pausar o anúncio atual e criar `CampaignAuditLog` notificando o usuário para aprovação do novo criativo
  - _Requisitos: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10, 7.11, 10.1, 10.4_

- [x] 17. Criar rotas de CRUD de regras de automação
  - Criar `src/app/api/paid-traffic/rules/route.ts`:
    - `POST`: validar body conforme `CreateRuleInput` (plataforma, condição e ação obrigatórios), chamar `automationRulesService.create`, retornar HTTP 201 com `AutomationRule`
    - `GET`: aceitar query param `campaignId` (opcional para filtrar por campanha), chamar `automationRulesService.listByCompany`, retornar HTTP 200 com `AutomationRule[]`
  - _Requisitos: 7.1, 7.11_

- [x] 18. Implementar `performance-monitor.service.ts`
  - Criar `src/server/services/performance-monitor.service.ts` implementando `PerformanceMonitorService`
  - Método `runCycle()`: buscar todas as campanhas com `status: 'active'` agrupadas por empresa; para cada campanha chamar `collectMetrics`; coletar lista de campanhas com falha sem interromper o ciclo; após coleta bem-sucedida chamar `automationRulesService.evaluate + execute` e `abTestService.checkAndFinalize`; somente se a coleta de métricas do ciclo for bem-sucedida chamar `generatePerformanceReport`; retornar `MonitorCycleResult`
  - Método `collectMetrics(campaign, creds)`: chamar `getMetrics` no conector correspondente para o período das últimas 6h; persistir `AdMetricSnapshot` no banco; se a chamada de API falhar, registrar via `logger.error` e retornar `null` sem lançar exceção
  - Método `generatePerformanceReport(companyId, snapshots)`: construir prompt com os snapshots em português, chamar `generateTextWithBedrock` e retornar relatório em linguagem natural contendo: valor gasto, número de conversões, custo por conversão e ROAS do período
  - _Requisitos: 6.1, 6.2, 6.3, 6.4, 6.5, 6.7, 6.8, 7.5, 9.4, 9.8_

- [x] 19. Implementar `ab-test.service.ts`
  - Criar `src/server/services/ab-test.service.ts` implementando `AbTestService`
  - Método `createVariations(companyId, campaignId, originalCreative, creds)`: gerar 3 criativos distintos via `generateTextWithBedrock` variando título, descrição e CTA; criar 3 anúncios separados na plataforma via conector dentro do mesmo Ad Set/grupo de anúncios; persistir `AbTest` com `status: 'active'` e `variationsJson`
  - Método `selectWinner(variations)`: retornar a variação com maior `ctr` do array — método puro sem efeitos colaterais
  - Método `checkAndFinalize(test, currentMetrics, creds)`: verificar se ≥48h passaram desde `startedAt`; verificar se todas as 3 variações têm ≥100 impressões; se sim, chamar `selectWinner`, pausar os 2 anúncios perdedores via API, atualizar `AbTest` com `status: 'completed'`, `winnerAdId` e `resultSummary`; se variação sem 100 impressões: incrementar `extensionCount` e estender em 24h; se `extensionCount` fez o total superar 7 dias: encerrar com `status: 'timeout'` selecionando o maior CTR disponível
  - _Requisitos: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9_

- [x] 20. Implementar `budget-intelligence.service.ts`
  - Criar `src/server/services/budget-intelligence.service.ts` implementando `BudgetIntelligenceService`
  - Método `getRecommendations(companyId)`: buscar todas as campanhas ativas; para cada campanha, agregar métricas dos últimos 30 dias e calcular ROAS médio ponderado; gerar `BudgetAllocation` com `currentDailyBudgetBrl`, `recommendedDailyBudgetBrl`, `changePercent` e `justification`; marcar `dataConfidence: 'insufficient'` se histórico < 7 dias (exatamente 7 dias = `'sufficient'`); gerar `aiSummary` e `justification` por campanha via `generateTextWithBedrock`
  - Método `apply(input, userId)`: para cada alocação, verificar `newDailyBudgetBrl`; se `≤ R$500`: chamar `updateAdSetBudget` / `updateCampaignBudget` no conector e registrar `CampaignAuditLog` com `source: 'budget_manager'`; se `> R$500`: criar `CampaignAuditLog` com `requiresConfirmation: true` sem executar a ação; retornar `{ applied, pendingConfirmation }`
  - _Requisitos: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 10.1, 10.4_

- [x] 21. Criar cron job `GET /api/cron/paid-traffic-monitor`
  - Criar `src/app/api/cron/paid-traffic-monitor/route.ts`
  - Validar header `Authorization: Bearer <CRON_SECRET>` comparando com `process.env.CRON_SECRET` via comparação segura (timing-safe); retornar HTTP 401 se ausente ou inválido
  - Chamar `performanceMonitorService.runCycle()` e retornar HTTP 200 com `MonitorCycleResult` serializado como JSON
  - _Requisitos: 6.1, 6.7, 6.8, 7.5, 9.4, 9.8_

- [x] 22. Criar rotas de inteligência de orçamento e auditoria
  - Criar `src/app/api/paid-traffic/budget-intelligence/route.ts` — `GET`: chamar `budgetIntelligenceService.getRecommendations(companyId)`, retornar HTTP 200 com `BudgetRecommendation`
  - Criar `src/app/api/paid-traffic/budget-intelligence/apply/route.ts` — `POST`: validar body `ApplyBudgetInput`, chamar `budgetIntelligenceService.apply(input, userId)`, retornar HTTP 200 com `{ applied: number, pendingConfirmation: number }`
  - Criar `src/app/api/paid-traffic/audit/route.ts` — `GET`: aceitar query params `campaignId`, `actionType`, `since`, `until`, `page` (default 1) e `pageSize` (default 50); filtrar `CampaignAuditLog` por `companyId` da sessão + parâmetros opcionais; retornar HTTP 200 com `{ data: CampaignAuditLog[], total, page, pageSize }`
  - _Requisitos: 8.2, 8.4, 8.5, 10.2, 10.4_

- [ ]* 23. Testes de propriedade e unitários para os serviços de automação
  - **Propriedade 2: Invariante de threshold de confirmação**
  - *Para qualquer* execução de regra onde `projectedNewBudgetBrl > 500`, o campo `requiresConfirmation` deve ser `true` — nunca executar ação automaticamente acima desse valor
  - **Valida: Requisito 7.8**
  - **Propriedade 3: Invariante de seleção de vencedor por CTR**
  - *Para qualquer* array não-vazio de variações de A/B test, `selectWinner(variations).ctr` deve ser igual a `Math.max(...variations.map(v => v.ctr))`
  - **Valida: Requisito 9.4**
  - Usar `fast-check` para gerar combinações arbitrárias de métricas, valores de orçamento e arrays de variações
  - Testes unitários adicionais: `performance-monitor` — falha em campanha individual não deve interromper o ciclo; relatório não deve ser gerado se coleta falhar; `budget-intelligence` — `dataConfidence: 'insufficient'` para < 7 dias e `'sufficient'` para exatamente 7 dias; `ab-test` — lógica de extensão de 24h e encerramento por timeout de 7 dias
  - _Requisitos: 6.8, 7.8, 8.6, 9.4, 9.8, 9.9_

---

## Fase 6 — Frontend

- [x] 24. Implementar componente `PlanGateGuard`
  - Criar `src/client/components/paid-traffic/PlanGateGuard.tsx`: buscar plano do usuário autenticado; se plano não elegível, renderizar tela de bloqueio com descrição do recurso de tráfego pago e botão de upgrade de plano; nunca renderizar estado intermediário — o usuário sempre vê a funcionalidade completa ou a tela de upgrade
  - Criar `src/app/(dashboard)/paid-traffic/layout.tsx` que envolve todas as subpáginas do módulo com `PlanGateGuard` como Server Component para garantir que a verificação ocorra no servidor
  - O redirect para URL direta deve retornar para a tela de upgrade (não para uma página de erro genérica)
  - _Requisitos: 1.1, 1.2, 1.3_

- [x] 25. Implementar página de credenciais (`/paid-traffic/credentials`)
  - Criar `src/app/(dashboard)/paid-traffic/credentials/page.tsx`
  - Criar `src/client/components/paid-traffic/credentials/CredentialStatusCard.tsx`: card por plataforma exibindo status (conectado/desconectado), data de última validação e botão de remover; botão "Remover" chama `DELETE /api/paid-traffic/credentials/[platform]`
  - Criar `src/client/components/paid-traffic/credentials/MetaAdsForm.tsx`: campos App ID, App Secret, Access Token e Ad Account ID; botão "Conectar" chama `POST /api/paid-traffic/credentials`; exibir loading durante validação (até 10s)
  - Criar `src/client/components/paid-traffic/credentials/GoogleAdsForm.tsx`: campos Developer Token, Client ID, Client Secret, Refresh Token e Customer ID; mesmo comportamento do formulário Meta
  - Exibir mensagem de erro descritiva em português sem expor os valores digitados
  - _Requisitos: 2.1, 2.2, 2.7, 2.8_

- [x] 26. Implementar wizard de criação de campanha (`/paid-traffic/new`)
  - Criar `src/app/(dashboard)/paid-traffic/new/page.tsx` com `CampaignWizard` como componente cliente
  - Criar `src/client/components/paid-traffic/wizard/CampaignWizard.tsx`: estado elevado (`useState`) para gerenciar o draft da IA e o passo atual (1, 2 ou 3); renderizar o componente do passo ativo
  - Criar `src/client/components/paid-traffic/wizard/StepDescribeGoal.tsx` (Passo 1): textarea para descrição do objetivo; botão "Gerar com IA" chama `POST /api/paid-traffic/campaigns/generate`; exibir estado de carregamento durante geração; em caso de erro HTTP 502 exibir mensagem amigável com botão "Tentar novamente"
  - Criar `src/client/components/paid-traffic/wizard/StepReviewAiDraft.tsx` (Passo 2): exibir todos os campos do `CampaignDraft` (objetivo, segmentação, orçamento, copies, keywords) como campos editáveis; permitir ao usuário ajustar antes de confirmar
  - Criar `src/client/components/paid-traffic/wizard/StepSelectPlatform.tsx` (Passo 3): checkboxes "Meta Ads" e "Google Ads"; botão "Lançar Campanha" chama `POST /api/paid-traffic/campaigns`; após sucesso exibir links diretos para o Gerenciador de Anúncios de cada plataforma
  - _Requisitos: 3.1, 3.2, 3.4, 3.5, 3.6, 3.7, 4.7, 5.7_

- [x] 27. Implementar dashboard de campanhas (`/paid-traffic`)
  - Criar `src/app/(dashboard)/paid-traffic/page.tsx` como página principal do módulo
  - Criar `src/client/components/paid-traffic/dashboard/CampaignListTable.tsx`: tabela com colunas nome, plataforma, status, CTR, CPC, ROAS e orçamento diário; buscar dados via `GET /api/paid-traffic/campaigns` com paginação; exibir link para o Gerenciador de Anúncios externo por campanha
  - Criar `src/client/components/paid-traffic/dashboard/CampaignMetricsBadge.tsx`: badges coloridos inline (verde/amarelo/vermelho) para CTR, CPC e ROAS baseados em thresholds de performance
  - Criar `src/client/components/paid-traffic/dashboard/PerformanceAlertBanner.tsx`: banner fixo no topo notificando quando novos relatórios de performance foram gerados no último ciclo do monitor
  - _Requisitos: 4.7, 5.7, 6.5, 6.6_

- [x] 28. Implementar página de regras de automação (`/paid-traffic/rules`)
  - Criar `src/app/(dashboard)/paid-traffic/rules/page.tsx`
  - Criar `src/client/components/paid-traffic/rules/RuleCreateForm.tsx`: formulário com seleção de métrica (CPC, CTR, ROAS, custo total, conversões), operador (maior que, menor que, igual a) e valor numérico para a condição; seleção de tipo de ação (pausar anúncio, pausar Ad Set, aumentar orçamento, substituir criativo) com campo de percentual condicional; submit chama `POST /api/paid-traffic/rules`
  - Criar `src/client/components/paid-traffic/rules/RuleList.tsx`: listagem das regras ativas com nome, condição, ação e toggle de ativação/desativação
  - Criar `src/client/components/paid-traffic/rules/RuleExecutionHistory.tsx`: histórico de execuções com data/hora, regra acionada, campanha afetada e resultado; filtros por campanha
  - _Requisitos: 7.1, 7.11_

- [x] 29. Implementar página de inteligência de orçamento (`/paid-traffic/budget`)
  - Criar `src/app/(dashboard)/paid-traffic/budget/page.tsx`
  - Criar `src/client/components/paid-traffic/budget/BudgetComparisonTable.tsx`: tabela comparativa lado a lado com orçamento atual e orçamento recomendado por campanha; indicador visual para campanhas com `dataConfidence: 'insufficient'` (ex.: badge "Dados insuficientes" em amarelo); dados via `GET /api/paid-traffic/budget-intelligence`
  - Criar `src/client/components/paid-traffic/budget/BudgetAiJustification.tsx`: painel expansível por campanha exibindo a justificativa em linguagem natural gerada pela IA
  - Criar `src/client/components/paid-traffic/budget/BudgetConfirmModal.tsx`: modal de confirmação explícita exibido quando qualquer campanha afetada tiver novo orçamento diário > R$500; exibir resumo com valores atuais e novos de cada campanha; botões "Confirmar" e "Cancelar"; confirmação chama `POST /api/paid-traffic/budget-intelligence/apply`
  - _Requisitos: 8.2, 8.3, 8.4, 8.5, 8.6_

- [x] 30. Implementar página de log de auditoria (`/paid-traffic/audit`)
  - Criar `src/app/(dashboard)/paid-traffic/audit/page.tsx`
  - Criar `src/client/components/paid-traffic/audit/AuditLogFilters.tsx`: filtros por campanha (select), tipo de ação (select) e período de data (date range picker); os filtros devem ser refletidos nos query params da URL para suportar navegação e compartilhamento
  - Criar `src/client/components/paid-traffic/audit/AuditLogTable.tsx`: tabela paginada com colunas: timestamp, tipo de ação, campanha afetada, valores anteriores (JSON formatado), valores novos, origem da ação e decisão do usuário quando aplicável; dados via `GET /api/paid-traffic/audit` com os filtros como query params
  - _Requisitos: 10.2, 10.3_

---

## Fase 7 — Integração e Polimento

- [x] 31. Testes de integração end-to-end
  - Escrever teste do fluxo completo de criação de campanha: chamar `campaignService.generate` com mock do Bedrock → validar estrutura do `CampaignDraft` retornado → chamar `campaignService.launch` com mocks dos conectores → verificar que `AdCampaign` foi persistido no banco com os campos externos corretos e que `CampaignAuditLog` foi criado
  - Escrever teste do ciclo de monitoramento: usar banco SQLite em memória; mockar conectores (`getMetrics`) e Bedrock (`generateTextWithBedrock`); chamar `performanceMonitorService.runCycle()`; verificar que `AdMetricSnapshot` foi salvo, regra avaliada e log de auditoria gerado
  - Escrever teste do fluxo A/B: criar `AbTest` com `startedAt` retroativo de 49h; chamar `abTestService.checkAndFinalize` com mock de métricas mostrando todas as 3 variações com ≥100 impressões; verificar que `selectWinner` retornou a variação de maior CTR e que os 2 perdedores foram pausados via mock do conector
  - _Requisitos: 1.4, 3.2, 4.1, 4.5, 5.1, 5.5, 6.1, 7.5, 7.6, 9.4, 9.5, 10.1_

- [x] 32. Adicionar link de "Tráfego Pago" à navegação lateral
  - Localizar o componente de sidebar em `src/client/components` ou no layout `src/app/(dashboard)/layout.tsx`
  - Adicionar item de menu "Tráfego Pago" com rota `/paid-traffic` e ícone de gráfico/anúncio (compatível com biblioteca de ícones já em uso no projeto)
  - O item deve ser exibido para todos os usuários autenticados — o `PlanGateGuard` no layout de `/paid-traffic` trata o bloqueio para planos inelegíveis
  - _Requisitos: 1.2, 1.3_

- [x] 33. Documentar variáveis de ambiente e atualizar `.env.example`
  - Adicionar comentário de bloco no início da seção do módulo de tráfego pago em `prisma/schema.prisma` indicando a necessidade da variável `CREDENTIAL_ENCRYPTION_KEY` para o funcionamento da criptografia de credenciais
  - Adicionar no `.env.example`:
    - `CREDENTIAL_ENCRYPTION_KEY=` com comentário: `# Chave AES-256-GCM em hex (64 chars). Gerar com: openssl rand -hex 32`
    - `CRON_SECRET=` com comentário: `# Secret para autenticar o cron job /api/cron/paid-traffic-monitor. Gerar com: openssl rand -hex 32`
  - _Requisitos: 2.4_

- [-] 34. Checkpoint final — garantir que todos os testes passam
  - Executar a suite completa de testes (`npx jest --runInBand`)
  - Verificar que todas as rotas de `/api/paid-traffic/*` retornam HTTP 403 para usuários com plano inelegível
  - Confirmar que nenhum valor de credencial (`token`, `secret`, `key`) aparece nos logs de desenvolvimento
  - Confirmar que o campo `encryptedData` no banco nunca é retornado nas respostas das APIs
