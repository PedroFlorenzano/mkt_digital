# Plano de Implementação: Multi-Company Management

## Overview

Transformar a plataforma de marketing digital do modelo 1 usuário → 1 empresa para 1 usuário → N empresas (carteira de clientes). A implementação segue a ordem do plano de migração do design: schema → repositório → serviço → auth/middleware → API routes → UI.

A linguagem de implementação é **TypeScript**, consistente com o projeto existente (Next.js 16, Prisma, next-auth v4).

---

## Tasks

- [x] 1. Migração do schema e infraestrutura de tipos
  - [x] 1.1 Atualizar `prisma/schema.prisma`: remover `@unique` de `Company.userId`, adicionar `@@index([userId])`, e renomear relação `User.company` para `User.companies` com tipo `Company[]`
    - Trocar `company Company?` por `companies Company[]` no modelo `User`
    - Remover `@unique` de `Company.userId`
    - Adicionar `@@index([userId])` ao modelo `Company`
    - _Requirements: 1.1, 1.3_

  - [x] 1.2 Gerar e aplicar a migration Prisma para remover a constraint `@unique`
    - Criar arquivo de migration via `prisma migrate dev --name remove_company_userid_unique`
    - Verificar que a migration preserva todos os dados existentes
    - Regenerar o Prisma Client (`prisma generate`)
    - _Requirements: 1.1_

  - [x] 1.3 Criar declarações TypeScript para estender JWT e Session do NextAuth
    - Criar arquivo `src/types/next-auth.d.ts` com extensões de `JWT` (`id: string; activeCompanyId?: string`) e `Session.user` (`id: string; activeCompanyId?: string`)
    - Exportar interfaces `CompanySummary`, `CompanyFull`, `CompanyInput`, `SelectCompanyResponse`, `SelectCompanyBody`, `PlanLimitResult`, `CompanyContextValue`, `SocialAccountSummary` em `src/types/company.ts`
    - _Requirements: 3.1, 9.1_

- [x] 2. Company Repository — camada de dados
  - [x] 2.1 Implementar novos métodos no `src/server/repositories/company.repository.ts`
    - `findAllByUserId(userId)`: `findMany` onde `userId` bate, ordenado por `name` asc (case-insensitive)
    - `findById(companyId)`: `findUnique` por `id`, retorna `null` se não existir
    - `countByUserId(userId)`: `count` por `userId`
    - `deleteById(companyId)`: excluir atomicamente a Company e todos os registros filhos em transação Prisma (`$transaction`), cobrindo Post, PostVariant, SocialAccount, CostLog, AdCampaign, AdMetricSnapshot, AdPlatformCredential, AutomationRule, RuleExecutionLog, AbTest, CampaignAuditLog, VideoJob, VideoCredit
    - Manter métodos existentes (`create`, `update`) funcionando — atualizar `create` para aceitar `userId` separado do `data`
    - _Requirements: 1.1, 1.2, 1.4, 1.5_

  - [ ]* 2.2 Escrever property test P1 — isolamento de dados entre usuários
    - **Property 1: Companies nunca vazam entre usuários distintos**
    - **Validates: Requirements 1.1, 7.1, 7.3**
    - Usar `fast-check`: `∀ userA ≠ userB → findAllByUserId(userB)` não contém nenhuma empresa de `userA`
    - Arquivo: `src/server/__tests__/repositories/company.repository.pbt.test.ts`

  - [ ]* 2.3 Escrever property test P5 — exclusão cascata é atômica
    - **Property 5: deleteById elimina todos os registros filhos sem deixar órfãos**
    - **Validates: Requirements 1.4, 1.5, 6.5**
    - Verificar que posts, socialAccounts, costLogs e demais filhos são zero após `deleteById`
    - Arquivo: `src/server/__tests__/repositories/company.repository.pbt.test.ts`

- [x] 3. Plan Guard e Company Service — lógica de negócio
  - [x] 3.1 Implementar funções de guarda de plano em `src/server/lib/plan-guard.ts`
    - `isAgencyPlan(userId)`: consultar `Subscription` do `userId`, retornar `true` somente se `status ∈ { "active", "trialing" }` e `plan.name === "Agencia"`
    - `assertCompanyLimit(userId)`: chamar `countByUserId` + `isAgencyPlan`; `maxAllowed = isAgency ? 20 : 1`; lançar `ForbiddenError` se `currentCount >= maxAllowed`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 5.6_

  - [x] 3.2 Implementar novos métodos no `src/server/services/company.service.ts`
    - `listByUserId(userId)`: delegar a `companyRepository.findAllByUserId`
    - `createCompany(userId, input)`: validar `2 ≤ trim(name).length ≤ 200` (lançar `ValidationError`), chamar `assertCompanyLimit`, criar via repositório
    - `updateCompany(userId, companyId, input)`: validar nome se fornecido, delegar a `companyRepository.update`
    - `deleteCompany(userId, companyId)`: verificar ownership, delegar a `companyRepository.deleteById`
    - `assertOwnership(userId, companyId)`: `findById`; se `null` ou `company.userId !== userId` lançar `ForbiddenError` opaco (HTTP 403) sem revelar existência
    - _Requirements: 1.6, 5.3, 5.5, 5.7, 6.2, 6.5, 7.2, 7.4, 9.2_

  - [ ]* 3.3 Escrever property test P2 — limite de plano é sempre respeitado
    - **Property 2: createCompany nunca persiste a N+1-ésima empresa quando N ≥ maxAllowed**
    - **Validates: Requirements 5.6, 8.3, 8.4**
    - Arquivo: `src/server/__tests__/services/company.service.pbt.test.ts`

  - [ ]* 3.4 Escrever property test P3 — assertOwnership é opaco
    - **Property 3: assertOwnership lança ForbiddenError para qualquer companyId inválido ou de outro usuário — nunca NotFoundError, nunca resolve**
    - **Validates: Requirements 7.2, 7.4, 9.2**
    - Arquivo: `src/server/__tests__/services/company.service.pbt.test.ts`

  - [ ]* 3.5 Escrever property test P4 — validação de nome é consistente
    - **Property 4: createCompany lança ValidationError para qualquer nome fora de [2, 200] chars após trim**
    - **Validates: Requirements 5.5, 5.7, 6.7**
    - Arquivo: `src/server/__tests__/services/company.service.pbt.test.ts`

- [x] 4. Autenticação — JWT callbacks e middleware Next.js

  - [x] 4.1 Atualizar callbacks JWT e session em `src/server/lib/auth.ts`
    - No `jwt` callback: popular `token.id` no primeiro login; no `trigger: "update"`, validar `activeCompanyId` via `prisma.company.findFirst({ where: { id, userId: token.id } })` antes de aceitar; aceitar `session.activeCompanyId = null` para limpar
    - No `session` callback: propagar `token.id` e `token.activeCompanyId` para `session.user`
    - _Requirements: 3.1, 3.3, 4.3, 9.3_

  - [ ]* 4.2 Escrever property test P6 — JWT callback não aceita activeCompanyId de outro usuário
    - **Property 6: jwt callback com trigger:"update" nunca altera activeCompanyId para um companyId que não pertence a token.id**
    - **Validates: Requirements 9.1, 9.2, 3.4**
    - Arquivo: `src/server/__tests__/lib/auth.pbt.test.ts`

  - [x] 4.3 Criar `src/middleware.ts` — proteção de rotas com JWT
    - Deixar passar: `/api/auth/*`, `/_next/*`, ativos estáticos
    - Rotas públicas: `/login`, `/register`, `/company-selector`
    - Sem token: redirecionar para `/login` (páginas) ou retornar HTTP 401 JSON (API)
    - Token sem `activeCompanyId`: redirecionar para `/company-selector` (páginas) ou HTTP 401 JSON (API, exceto `/api/companies/select`)
    - Token com `activeCompanyId`: injetar headers `x-user-id` e `x-active-company-id` e deixar passar
    - Configurar `matcher` para cobrir todas as rotas exceto assets estáticos
    - _Requirements: 3.4, 3.5, 9.1_

- [x] 5. API Routes de gerenciamento de empresas

  - [x] 5.1 Criar `src/app/api/companies/route.ts` — listar portfólio e criar empresa
    - `GET`: `getServerSession` → `companyService.listByUserId(userId)` → retornar `CompanySummary[]`
    - `POST`: `getServerSession` → `companyService.createCompany(userId, body)` → retornar `201` com `Company`
    - Tratar `ValidationError` → 422, `ForbiddenError` → 403, sem sessão → 401
    - _Requirements: 2.1, 5.3, 5.6, 8.1, 8.2_

  - [x] 5.2 Criar `src/app/api/companies/select/route.ts` — selecionar empresa ativa
    - `POST`: `getServerSession` → validar `body.companyId` não vazio → `companyService.assertOwnership(userId, companyId)` → retornar `{ ok: true, activeCompanyId }`
    - O cliente propaga via `useSession().update({ activeCompanyId })` após receber OK
    - _Requirements: 2.4, 3.1, 4.4, 9.3_

  - [x] 5.3 Criar `src/app/api/companies/[id]/route.ts` — editar e remover empresa
    - `PATCH`: `getServerSession` → `assertOwnership` → `companyService.updateCompany(userId, id, body)` → retornar `Company` atualizada
    - `DELETE`: `getServerSession` → `assertOwnership` → `companyService.deleteCompany(userId, id)` → retornar `{ ok: true }`
    - _Requirements: 6.1, 6.2, 6.5, 1.4_

  - [ ]* 5.4 Escrever testes unitários para as API routes de companies
    - Cobrir: 200 para empresa válida, 403 para empresa de outro usuário, 403 para companyId inexistente (resposta opaca), 401 sem sessão, 422 sem companyId no body (select), 422 nome inválido (create)
    - Arquivo: `src/server/__tests__/api/companies.test.ts`

- [x] 6. Checkpoint — verificar camada de servidor
  - Garantir que todos os testes passam (`npm test`), especialmente property tests e testes de API routes.
  - Verificar que a migration foi aplicada e o Prisma Client foi regenerado.
  - Perguntar ao usuário se há dúvidas antes de prosseguir com a camada de UI.

- [x] 7. Contexto React — CompanyContext e useActiveCompany

  - [x] 7.1 Criar `src/client/components/company/CompanyContext.tsx`
    - Implementar `CompanyProvider`: buscar `GET /api/companies/[activeCompanyId]` (ou usar `session.user.activeCompanyId`) quando a sessão tem `activeCompanyId`; expor `company`, `isLoading`, `error`, `refresh` via context
    - Implementar hook `useActiveCompany()`: consumir o context; lançar erro se usado fora do provider
    - Exibir estado de carregamento sem bloquear render do layout
    - _Requirements: 10.5, 3.2, 4.2_

- [x] 8. Company Selector — interface de seleção de empresa

  - [x] 8.1 Criar componente `src/client/components/company/CompanySelectorCard.tsx`
    - Exibir nome da empresa (máx. 200 chars), logo da empresa quando disponível ou avatar genérico com inicial do nome quando não disponível, e setor
    - Indicar visualmente a empresa atualmente ativa (borda, ícone de check, ou outro indicador persistente)
    - _Requirements: 2.3, 10.3_

  - [x] 8.2 Criar página `src/app/(dashboard)/company-selector/page.tsx`
    - Ao carregar: `GET /api/companies` para listar portfólio em ordem alfabética
    - Se portfólio vazio: exibir exclusivamente opção "Criar primeira empresa"
    - Se erro ao carregar: exibir mensagem de erro com botão "Tentar novamente"
    - Ao selecionar empresa: `POST /api/companies/select` → `useSession().update({ activeCompanyId })` → redirecionar para `/dashboard`
    - Se `update` de sessão falhar: exibir mensagem de erro, manter usuário no seletor sem alterar estado
    - Exibir ação explícita "Adicionar nova empresa" (chamando fluxo de onboarding)
    - _Requirements: 2.1, 2.2, 2.4, 2.5, 2.6, 5.1, 5.2_

- [x] 9. Sidebar e Dashboard Layout — contexto visual da empresa ativa

  - [x] 9.1 Atualizar `src/client/components/layout/dashboard-layout.tsx`
    - Envolver o conteúdo do dashboard com `CompanyProvider`
    - _Requirements: 3.2, 10.4_

  - [x] 9.2 Atualizar `src/client/components/layout/sidebar.tsx`
    - Usar `useActiveCompany()` para obter dados da empresa ativa
    - Exibir área permanentemente visível com nome e logo da empresa ativa (ou avatar com inicial)
    - Mostrar indicador de carregamento (`isLoading`) até dados disponíveis
    - Exibir logo se disponível e carregado; fallback para avatar genérico com inicial
    - Adicionar elemento clicável que abre/navega para `/company-selector` como overlay ou redirect
    - _Requirements: 4.1, 4.2, 10.1, 10.2, 10.3, 10.4, 10.5_

- [x] 10. Isolamento de dados — atualizar API routes existentes

  - [x] 10.1 Atualizar `src/app/api/company/route.ts` (rota legada) para resolver `companyId` exclusivamente do JWT
    - Remover qualquer leitura de `companyId` de `body`, `query` ou `params` como fonte de autorização
    - Adicionar `assertOwnership(userId, activeCompanyId)` antes de qualquer operação
    - Retornar 401 se `activeCompanyId` ausente do JWT
    - _Requirements: 9.1, 9.2, 9.4, 7.1, 7.2_

  - [x] 10.2 Auditar e atualizar todas as demais API routes que leem dados por `companyId` (`/api/posts`, `/api/costs`, `/api/social`, `/api/generate`, `/api/upload`, `/api/paid-traffic/*`, `/api/video/*`)
    - Para cada route: substituir resolução de `companyId` por leitura do `activeCompanyId` do JWT (`getServerSession`)
    - Adicionar verificação de `company.userId === session.user.id` antes de operações de leitura e escrita
    - Retornar 403 opaco quando `companyId` não pertencer ao usuário autenticado
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 9.1, 9.2_

- [x] 11. Onboarding e restrições de plano

  - [x] 11.1 Atualizar `src/app/(dashboard)/onboarding/page.tsx` para suportar criação de novas empresas e edição da empresa ativa
    - Detectar se há `activeCompanyId` na sessão: se sim, pré-preencher formulário com dados atuais via `GET /api/companies/[id]`; se não, exibir formulário vazio para nova empresa
    - No submit de criação: `POST /api/companies` → selecionar automaticamente via `POST /api/companies/select` → redirecionar para `/dashboard`
    - No submit de edição: `PATCH /api/companies/[id]` → exibir feedback de sucesso
    - Exibir erro específico e preservar dados preenchidos se validação falhar (nome inválido) ou erro técnico ocorrer
    - _Requirements: 5.2, 5.3, 5.4, 5.5, 5.7, 5.8, 6.1, 6.2, 6.7_

  - [x] 11.2 Implementar restrição de plano na Company Selector UI
    - Se plano < Agência: não exibir opção "Adicionar nova empresa" no seletor; exibir mensagem informativa ao tentar adicionar segunda empresa
    - Verificar plano via `GET /api/user/plan` ou incluir dados de plano na sessão
    - _Requirements: 8.4, 8.5, 8.6_

- [x] 12. Checkpoint final — validação completa
  - Garantir que todos os testes passam (`npm test`), ask the user if questions arise.

---

## Notes

- Tasks marcadas com `*` são opcionais e podem ser puladas para MVP mais rápido
- `fast-check` já está instalado em `node_modules` (confirmado) — não é necessário instalar
- Cada task referencia requirements específicos para rastreabilidade
- O middleware em `src/middleware.ts` deve ficar na raiz de `src/`, não em `app/`
- Checkpoints garantem validação incremental antes de avançar para a próxima camada
- Property tests validam invariantes universais; testes unitários validam exemplos específicos
- A migration do Prisma é não-destrutiva: apenas relaxa a constraint `@unique`, preservando todos os dados existentes

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.3"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["2.1", "3.1", "4.1"] },
    { "id": 3, "tasks": ["3.2", "4.3", "8.1"] },
    { "id": 4, "tasks": ["2.2", "2.3", "3.3", "3.4", "3.5", "4.2", "5.1", "5.2", "5.3", "7.1"] },
    { "id": 5, "tasks": ["5.4", "8.2", "9.1"] },
    { "id": 6, "tasks": ["9.2", "10.1", "10.2"] },
    { "id": 7, "tasks": ["11.1", "11.2"] }
  ]
}
```
