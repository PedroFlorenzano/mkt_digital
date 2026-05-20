# Plano de Implementação: Knowledge Base Agent

## Visão Geral

Implementação incremental do módulo **Knowledge Base Agent**, que estende a plataforma MKT Digital com bases de conhecimento proprietárias acessíveis via WhatsApp. A implementação segue a arquitetura existente da plataforma: repositórios → serviços → rotas de API → páginas de dashboard.

A linguagem de implementação é **TypeScript**, seguindo os padrões do projeto (Next.js App Router, Prisma, Jest + fast-check).

---

## Tasks

- [x] 1. Schema Prisma e Migração de Banco de Dados
  - [x] 1.1 Adicionar novos modelos ao schema Prisma
    - Criar os modelos `KnowledgeBase`, `CatalogField`, `CatalogRecord`, `KBAgent` e `KBMessage` conforme especificado no design
    - Adicionar `@@index`, `@@unique` e `onDelete: Cascade` conforme o design
    - Adicionar os campos de relação `knowledgeBases KnowledgeBase[]` e `kbAgents KBAgent[]` ao modelo `Company` existente
    - Verificar se o arquivo `prisma/schema.prisma` compila sem erros com `npx prisma validate`
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7_

  - [x] 1.2 Gerar e aplicar a migração de banco de dados
    - Executar `npx prisma migrate dev --name add_knowledge_base_agent` para criar o arquivo SQL de migração
    - Verificar que a migração aplica sem erros no banco de dados de desenvolvimento
    - Executar `npx prisma generate` para atualizar o Prisma Client
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

- [x] 2. Camada de Repositório

  - [x] 2.1 Implementar `knowledgeBaseRepository`
    - Criar `src/server/repositories/knowledgeBase.repository.ts`
    - Implementar: `findByCompanyId`, `findById`, `create`, `update`, `delete`, `countByCompanyId`
    - Usar o padrão Prisma existente dos repositórios atuais (`agent.repository.ts`, `cost.repository.ts`)
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 1.9, 9.6_

  - [x] 2.2 Implementar `catalogRepository` (campos e registros)
    - Criar `src/server/repositories/catalog.repository.ts`
    - Implementar métodos de CatalogField: `findFieldsByKBId`, `createField`, `updateField`, `deleteField`, `countFieldsByKBId`
    - Implementar métodos de CatalogRecord: `findRecordsByKBId` (paginado), `findAllRecordsByKBId`, `createRecord`, `createManyRecords`, `updateRecord`, `deleteRecord`, `deleteAllRecordsByKBId`, `countRecordsByKBId`, `removeFieldFromAllRecords`
    - _Requirements: 2.1, 2.2, 2.5, 3.1, 3.6, 3.7, 3.8, 3.10_

  - [x] 2.3 Implementar `kbAgentRepository`
    - Criar `src/server/repositories/kbAgent.repository.ts`
    - Implementar: `findById`, `findByKnowledgeBaseId`, `findByCompanyId`, `create`, `update`, `toggleStatus`, `delete`
    - _Requirements: 4.1, 4.2, 4.5, 4.6, 4.8_

  - [x] 2.4 Implementar `kbMessageRepository`
    - Criar `src/server/repositories/kbMessage.repository.ts`
    - Implementar: `save`, `getHistory` (últimas N mensagens ordenadas por `createdAt` asc), `listConversations` (agrupado por `remoteJid`, paginado), `countTodayUserMessages` (contagem do dia UTC corrente com `role = "user"`)
    - _Requirements: 5.3, 5.4, 5.5, 8.1, 8.2, 9.4_

- [x] 3. Serviços de Domínio — Knowledge Base e Catálogo

  - [x] 3.1 Implementar `knowledgeBaseService`
    - Criar `src/server/services/knowledgeBase.service.ts`
    - Implementar: `listByCompanyId`, `getById`, `create`, `update`, `delete`, `assertOwnership`
    - Validar limites: nome 1–100 chars, descrição até 500 chars, máximo de 10 KBs por empresa
    - Validar que o `delete` em cascata remove CatalogFields, CatalogRecords, KBAgents e KBMessages
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.9, 1.10, 9.1, 9.2, 9.6_

  - [ ]* 3.2 Escrever testes unitários para `knowledgeBaseService`
    - Testar `assertOwnership` (dono correto, empresa errada → ForbiddenError, não encontrado → NotFoundError)
    - Testar limite de 10 KBs por empresa (ValidationError no 11º)
    - Testar validação de campos (nome vazio, nome > 100, descrição > 500)
    - _Requirements: 1.3, 1.6, 1.10, 9.2, 9.6_

  - [x] 3.3 Implementar `catalogFieldService`
    - Criar `src/server/services/catalogField.service.ts`
    - Implementar: `listByKBId`, `create`, `update`, `delete`
    - Validar: nome 1–50 chars, apenas alfanumérico e underscores, tipos válidos, limite de 50 campos, nome único por KB
    - Na exclusão de campo, acionar `removeFieldFromAllRecords` para atualizar os JSONs existentes
    - _Requirements: 2.2, 2.3, 2.5, 2.6, 2.9, 9.1, 9.2_

  - [ ]* 3.4 Escrever testes unitários para `catalogFieldService`
    - Testar criação com nome duplicado (ConflictError)
    - Testar limite de 50 campos (ValidationError)
    - Testar validação de nome com caracteres inválidos
    - Testar que a exclusão de campo chama `removeFieldFromAllRecords`
    - _Requirements: 2.3, 2.6, 2.9_

  - [x] 3.5 Implementar `catalogRecordService`
    - Criar `src/server/services/catalogRecord.service.ts`
    - Implementar: `list`, `create`, `update`, `delete`, `deleteAll`
    - Validar formatos por tipo de campo: number (decimal com `.`), date (YYYY-MM-DD)
    - Verificar limite de 50.000 registros por KB antes de criar
    - _Requirements: 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 9.1, 9.2_

  - [ ]* 3.6 Escrever testes unitários para `catalogRecordService`
    - Testar validação de formato de campos (number e date inválidos → ValidationError)
    - Testar limite de 50.000 registros (rejeição na criação manual e no upload)
    - Testar `deleteAll` (remove registros sem alterar CatalogFields)
    - _Requirements: 3.5, 3.9_

- [x] 4. Checkpoint — Testar Repositórios e Serviços de Catálogo
  - Garantir que todos os testes unitários das tasks 3.2, 3.4 e 3.6 passam
  - Verificar que `npx prisma validate` e `npx prisma generate` não produzem erros
  - Perguntar ao usuário se há dúvidas antes de prosseguir.

- [x] 5. Serviços de Ingestão de Dados

  - [x] 5.1 Implementar `schemaInferrerService`
    - Criar `src/server/services/schemaInferrer.service.ts`
    - Analisar cabeçalho e até 20 linhas de amostra do CSV (Node.js streams, sem libs externas)
    - Inferir tipo de cada coluna: `number` (valor parseable como float), `boolean` (`true`/`false`/`1`/`0`), `date` (YYYY-MM-DD), `text` (string > 200 chars), `string` (padrão para ambíguo)
    - Retornar array de `InferredField: { name, dataType, sampleValues }`
    - Rejeitar CSV vazio, sem cabeçalho ou com encoding inválido
    - _Requirements: 2.7, 2.8, 2.10_

  - [ ]* 5.2 Escrever testes unitários para `schemaInferrerService`
    - Testar inferência correta de cada tipo: number, boolean, date, string, text
    - Testar coluna ambígua → retorna `string`
    - Testar CSV vazio, sem cabeçalho, encoding inválido → erros descritivos
    - _Requirements: 2.7, 2.8, 2.10_

  - [x] 5.3 Implementar `csvIngestorService`
    - Criar `src/server/services/csvIngestor.service.ts`
    - Implementar parsing RFC 4180 básico (vírgula como delimitador, aspas duplas) com streams do Node.js
    - Validar antes de processar: tamanho ≤ 10 MB, linhas ≤ 10.000, total resultante ≤ 50.000 registros
    - Fazer correspondência case-sensitive entre colunas do CSV e CatalogFields; ignorar colunas não reconhecidas
    - Processar linha a linha: registrar erros de formato (number/date inválidos) sem interromper o processamento
    - Retornar `IngestResult: { created, errors, errorDetails }`
    - _Requirements: 3.1, 3.2, 3.3, 3.9_

  - [ ]* 5.4 Escrever testes unitários para `csvIngestorService`
    - Testar CSV válido com todas as colunas reconhecidas
    - Testar arquivo > 10 MB e > 10.000 linhas (rejeição prévia)
    - Testar upload que ultrapassaria o limite de 50.000 registros
    - Testar linhas com valores inválidos: continua processando, registra erros
    - Testar colunas não reconhecidas são ignoradas
    - _Requirements: 3.1, 3.2, 3.3, 3.9_

  - [ ]* 5.5 Escrever teste de propriedade para conservação de contagem do CSV Ingestor (Propriedade 4)
    - **Propriedade 4: Conservação de Contagem no CSV Ingestor**
    - **Valida: Requisito 12.5, 3.3**
    - Para todo CSV gerado com `fc.array(csvRowArb, { minLength: 1 })`, verificar que `registrosCriados + linhasComErro = N` (total de linhas de dados)
    - Configurar com mínimo de 100 iterações (`numRuns: 100`)
    - Incluir comentário: `// Feature: knowledge-base-agent, Propriedade 4: Conservação de Contagem no CSV Ingestor`
    - Criar em `src/server/__tests__/services/csvIngestor.property.test.ts`
    - _Requirements: 12.5, 3.3_

- [x] 6. Serviço de KBAgent e SearchTool

  - [x] 6.1 Implementar `kbAgentService`
    - Criar `src/server/services/kbAgent.service.ts`
    - Implementar: `getByKBId`, `create`, `update`, `toggleStatus`, `delete`, `getById` (sem auth, para webhook)
    - Validar campos na criação/edição: nome 1–100, instanceName 1–60 (alfanumérico+hífens), URL válida (http/https), prompt 10–5000, delaySeconds 1–60, maxMessagesPerDay 1–500
    - Validar unicidade de `instanceName` consultando `WhatsAppAgent` e `KBAgent` da mesma empresa
    - Garantir que `instanceName` seja somente leitura na edição
    - Status padrão na criação: `"active"`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.9_

  - [ ]* 6.2 Escrever testes unitários para `kbAgentService`
    - Testar criação com todos os campos válidos e status padrão `active`
    - Testar conflito de `instanceName` com `WhatsAppAgent` existente (ConflictError)
    - Testar `toggleStatus`: `active` → `paused` e `paused` → `active`
    - Testar validação de cada campo fora do intervalo permitido
    - _Requirements: 4.1, 4.2, 4.3, 4.9_

  - [ ]* 6.3 Escrever teste de propriedade para toggle de status do KBAgent (Propriedade 5)
    - **Propriedade 5: Complemento de Toggle de Status**
    - **Valida: Requisito 12.6, 4.6**
    - Para qualquer status inicial em `fc.constantFrom("active", "paused")`, verificar que após um toggle o status é o complemento e após dois toggles o status é restaurado ao original
    - Configurar com mínimo de 100 iterações (`numRuns: 100`)
    - Incluir comentário: `// Feature: knowledge-base-agent, Propriedade 5: Complemento de Toggle de Status`
    - Criar em `src/server/__tests__/services/kbAgent.property.test.ts`
    - _Requirements: 12.6, 4.6_

  - [x] 6.4 Implementar `searchToolService`
    - Criar `src/server/services/searchTool.service.ts`
    - Implementar a função `search(knowledgeBaseId, filters)` que carrega todos os registros via `findAllRecordsByKBId` e aplica filtragem em memória (JavaScript)
    - Suportar filtros por tipo:
      - `string`: case-insensitive, correspondência parcial (`includes`)
      - `number`: operadores `eq`, `gte`, `lte`, `between` (inclusivo)
      - `boolean`: correspondência exata
      - `date`: operadores `eq`, `gte`, `lte` com valores YYYY-MM-DD
    - Ignorar filtros para campos inexistentes ou com `isFilterable = false`
    - Quando nenhum filtro válido, retornar os 10 mais recentes por `createdAt` desc
    - Retornar no máximo 10 registros, ordenados pelo número de filtros satisfeitos (desc)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9_

  - [ ]* 6.5 Escrever testes unitários para `searchToolService`
    - Testar cada tipo de filtro individualmente (string parcial, number gte/lte/between, boolean, date)
    - Testar filtro de campo não filtrável é ignorado
    - Testar sem filtros → retorna os 10 mais recentes
    - Testar KB com 15 registros → retorna no máximo 10
    - Testar filtro AND: apenas registros satisfazendo todos os filtros são retornados
    - Testar isolamento: busca opera apenas na KB do agente
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9_

- [ ] 7. Testes de Propriedade da SearchTool

  - [ ]* 7.1 Escrever teste de propriedade para round-trip de serialização (Propriedade 1)
    - **Propriedade 1: Round-Trip de Serialização de CatalogRecord**
    - **Valida: Requisito 12.1**
    - Usar `fc.record({ titulo: fc.string(), preco: fc.double({ min: 0 }), disponivel: fc.boolean() })` para gerar dados
    - Verificar que `JSON.parse(JSON.stringify(data))` produz objeto com mesmas chaves e valores (comparação profunda)
    - Configurar com mínimo de 100 iterações (`numRuns: 100`)
    - Incluir comentário: `// Feature: knowledge-base-agent, Propriedade 1: Round-Trip de Serialização de CatalogRecord`
    - Criar em `src/server/__tests__/services/searchTool.property.test.ts`
    - _Requirements: 12.1_

  - [ ]* 7.2 Escrever teste de propriedade para corretude de filtros sem falsos positivos (Propriedade 2)
    - **Propriedade 2: Corretude de Filtros da SearchTool (Sem Falsos Positivos)**
    - **Valida: Requisito 12.2, 7.1, 7.2, 7.3, 7.4, 7.5**
    - Gerar array de registros e um filtro válido com `fc.array` e `searchFiltersArb`
    - Verificar que todos os registros retornados satisfazem os filtros aplicados
    - Configurar com mínimo de 100 iterações (`numRuns: 100`)
    - Incluir comentário: `// Feature: knowledge-base-agent, Propriedade 2: Corretude de Filtros (Sem Falsos Positivos)`
    - Adicionar ao arquivo `src/server/__tests__/services/searchTool.property.test.ts`
    - _Requirements: 12.2, 7.1, 7.2, 7.3, 7.4, 7.5_

  - [ ]* 7.3 Escrever teste de propriedade para limite de resultados da SearchTool (Propriedade 3)
    - **Propriedade 3: Limite de Resultados da SearchTool**
    - **Valida: Requisito 12.3, 7.6**
    - Gerar KBs com N registros (N de 0 a 100) via `fc.integer({ min: 0, max: 100 })`
    - Verificar que o resultado sempre tem `length ≤ 10`, independentemente de N
    - Configurar com mínimo de 100 iterações (`numRuns: 100`)
    - Incluir comentário: `// Feature: knowledge-base-agent, Propriedade 3: Limite de Resultados da SearchTool`
    - Adicionar ao arquivo `src/server/__tests__/services/searchTool.property.test.ts`
    - _Requirements: 12.3, 7.6_

  - [ ]* 7.4 Escrever teste de propriedade para filtros compostos metamórficos (Propriedade 7)
    - **Propriedade 7: Filtros Compostos são Subconjunto dos Individuais**
    - **Valida: Requisito 12.8, 7.6**
    - Gerar array de registros e dois filtros individuais `f1`, `f2` válidos
    - Verificar que `|resultados(f1 AND f2)| ≤ |resultados(f1)|` e `|resultados(f1 AND f2)| ≤ |resultados(f2)|`
    - Configurar com mínimo de 100 iterações (`numRuns: 100`)
    - Incluir comentário: `// Feature: knowledge-base-agent, Propriedade 7: Filtros Compostos são Subconjunto dos Individuais`
    - Adicionar ao arquivo `src/server/__tests__/services/searchTool.property.test.ts`
    - _Requirements: 12.8, 7.6_

- [x] 8. Substituição de Variáveis do systemPrompt

  - [x] 8.1 Implementar função de substituição de variáveis do systemPrompt
    - Criar `src/server/lib/prompt-variables.kb.ts`
    - Implementar função `resolveKBSystemPrompt(template: string, agentName: string, today: string): string`
    - Substituir todas as ocorrências de `{{agentName}}` pelo `KBAgent.name` e `{{today}}` pela data UTC no formato YYYY-MM-DD
    - Garantir que nenhuma ocorrência das variáveis permaneça após a substituição
    - _Requirements: 12.7_

  - [ ]* 8.2 Escrever teste de propriedade para substituição de variáveis (Propriedade 6)
    - **Propriedade 6: Substituição Completa de Variáveis do systemPrompt**
    - **Valida: Requisito 12.7**
    - Gerar templates com `fc.string()` intercalados com zero ou mais ocorrências de `{{agentName}}` e `{{today}}` inseridas em posições aleatórias
    - Verificar que após `resolveKBSystemPrompt`, o resultado não contém `{{agentName}}` nem `{{today}}`
    - Configurar com mínimo de 100 iterações (`numRuns: 100`)
    - Incluir comentário: `// Feature: knowledge-base-agent, Propriedade 6: Substituição Completa de Variáveis do systemPrompt`
    - Criar em `src/server/__tests__/lib/prompt-variables.kb.property.test.ts`
    - _Requirements: 12.7_

- [x] 9. Checkpoint — Testar Serviços e Propriedades
  - Garantir que todos os testes das tasks 5.2, 5.4, 5.5, 6.2, 6.3, 6.5, 7.1, 7.2, 7.3, 7.4, 8.2 passam
  - Verificar que a função `resolveKBSystemPrompt` é exportada corretamente
  - Perguntar ao usuário se há dúvidas antes de prosseguir.

- [x] 10. Webhook Handler (Processamento de Mensagens)

  - [x] 10.1 Implementar o webhook handler — guards e infraestrutura base
    - Criar `src/app/api/kb-agent/[agentId]/route.ts`
    - Implementar `POST` público (sem autenticação NextAuth)
    - Implementar guards na seguinte ordem:
      1. Buscar `KBAgent` pelo `agentId`; retornar HTTP 200 se não encontrado (log de aviso)
      2. Checar status `paused` → retornar HTTP 200 imediatamente (< 100 ms)
      3. Loop guard: `remoteJid === instanceName` → retornar HTTP 200
      4. Limite diário: `countTodayUserMessages(agentId, remoteJid) >= maxMessagesPerDay` → retornar HTTP 200
    - _Requirements: 5.1, 5.2, 5.3, 9.3, 9.4_

  - [x] 10.2 Implementar processamento de mensagens de texto no webhook
    - Extrair `remoteJid`, `content`, `contactName` do payload EvolutionAPI
    - Persistir KBMessage `role = "user"`, `messageType = "text"` antes de invocar Bedrock
    - Carregar histórico das últimas 20 mensagens da conversa via `kbMessageRepository.getHistory`
    - Implementar loop de ciclos Bedrock com `tool_use` / `tool_result`:
      - Ciclo 1: enviar histórico + definição da `SearchTool` (`search_catalog`)
      - Quando Claude retorna `tool_use`: executar `searchToolService.search(knowledgeBaseId, filters)` e enviar `tool_result`
      - Ciclo final: enviar texto final ao Operador via EvolutionAPI com `delaySeconds`
    - Acumular `inputTokens` e `outputTokens` de todos os ciclos para o CostLog
    - Resolver variáveis `{{agentName}}` e `{{today}}` no systemPrompt antes de enviar ao Bedrock
    - _Requirements: 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 5.11_

  - [x] 10.3 Implementar processamento de mensagens de áudio no webhook
    - Detectar mensagens de tipo `audioMessage` ou `pttMessage`
    - Baixar arquivo de áudio da EvolutionAPI
    - Verificar duração do áudio: se > 300 s, retornar HTTP 200 e enviar mensagem de aviso ao Operador
    - Enviar para AWS Transcribe (batch job com polling + back-off exponencial) e aguardar transcrição
    - Em caso de falha no download, erro do Transcribe ou transcrição vazia: log + HTTP 200 + mensagem de erro ao Operador
    - Quando transcrição bem-sucedida: persistir `role = "user"`, `messageType = "audio"`, `content = textoTranscrito`; prosseguir com o mesmo fluxo de texto do task 10.2
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 10.4 Implementar gravação de CostLog no webhook
    - Após envio bem-sucedido da resposta de texto: gravar CostLog com `type = "kb_agent_text"`, modelo Bedrock, tokens acumulados, `costUsd` calculado, `metadata: { agentId, remoteJid }`
    - Se tokens ausentes na resposta Bedrock: gravar com `inputTokens = 0`, `outputTokens = 0`, `costUsd = 0`
    - Após transcrição bem-sucedida: gravar CostLog separado com `type = "kb_agent_transcription"`, `model = "aws-transcribe"`, `costUsd` baseado na duração em segundos, `metadata: { agentId, durationSeconds }`
    - Falha na gravação do CostLog: log + continuar fluxo sem interromper
    - _Requirements: 5.11, 6.5, 10.1, 10.2, 10.4, 10.5_

  - [ ]* 10.5 Escrever testes unitários para o webhook handler
    - Testar cada guard: paused (retorna 200 imediatamente), loop guard, limite diário
    - Testar fluxo de texto bem-sucedido com mock de Bedrock retornando `tool_use` + texto final
    - Testar fluxo sem tool use (Claude responde diretamente)
    - Testar falha do Bedrock → HTTP 200 sem resposta ao operador
    - Testar EvolutionAPI retornando 401/403 → log + HTTP 200
    - Testar fluxo de áudio bem-sucedido com mock de Transcribe
    - Testar áudio > 300 s → mensagem de aviso + HTTP 200
    - Testar falha no download do áudio → mensagem de erro + HTTP 200
    - Testar gravação de CostLog (texto e transcrição)
    - _Requirements: 5.1, 5.2, 5.3, 5.9, 5.10, 6.4, 6.6, 9.7_

- [x] 11. Rotas de API — Knowledge Bases

  - [x] 11.1 Implementar rotas de KnowledgeBase (`/api/knowledge-bases`)
    - Criar `src/app/api/knowledge-bases/route.ts` (GET: listar, POST: criar)
    - Criar `src/app/api/knowledge-bases/[id]/route.ts` (GET: obter, PATCH: atualizar, DELETE: excluir)
    - Usar autenticação NextAuth existente; extrair `companyId` da sessão
    - Mapear erros do serviço para status HTTP: `NotFoundError` → 404, `ForbiddenError` → 403, `ValidationError` → 400, `ConflictError` → 409
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6, 1.9, 1.10, 1.11_

  - [x] 11.2 Implementar rotas de CatalogField (`/api/knowledge-bases/[id]/fields`)
    - Criar `src/app/api/knowledge-bases/[id]/fields/route.ts` (GET: listar, POST: criar)
    - Criar `src/app/api/knowledge-bases/[id]/fields/[fieldId]/route.ts` (PATCH: atualizar, DELETE: excluir)
    - Criar `src/app/api/knowledge-bases/[id]/fields/infer/route.ts` (POST: inferir campos de CSV via `schemaInferrerService`)
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10_

  - [x] 11.3 Implementar rotas de CatalogRecord (`/api/knowledge-bases/[id]/records`)
    - Criar `src/app/api/knowledge-bases/[id]/records/route.ts` (GET: listar paginado, POST: criar, DELETE: limpar todos)
    - Criar `src/app/api/knowledge-bases/[id]/records/[recordId]/route.ts` (PATCH: atualizar, DELETE: excluir)
    - Criar `src/app/api/knowledge-bases/[id]/records/upload/route.ts` (POST: upload CSV via `csvIngestorService`, receber `multipart/form-data`)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10_

  - [x] 11.4 Implementar rotas de KBAgent (`/api/knowledge-bases/[id]/agent`)
    - Criar `src/app/api/knowledge-bases/[id]/agent/route.ts` (GET: obter, POST: criar, PATCH: atualizar, DELETE: excluir)
    - Criar `src/app/api/knowledge-bases/[id]/agent/status/route.ts` (PATCH: toggle status)
    - Na resposta de criação bem-sucedida, incluir `webhookUrl: /api/kb-agent/${agentId}`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.8, 4.9_

  - [x] 11.5 Implementar rotas de Conversas (`/api/knowledge-bases/[id]/conversations`)
    - Criar `src/app/api/knowledge-bases/[id]/conversations/route.ts` (GET: listar conversas agrupadas por `remoteJid`, paginado 20 por página)
    - Criar `src/app/api/knowledge-bases/[id]/conversations/[remoteJid]/route.ts` (GET: histórico completo da conversa)
    - Verificar propriedade antes de retornar dados; ForbiddenError → 403
    - _Requirements: 8.1, 8.2, 8.5, 8.6, 8.7_

- [x] 12. Checkpoint — Testar Rotas de API
  - Garantir que os testes unitários do webhook (task 10.5) passam
  - Verificar ausência de erros TypeScript nas rotas com `npx tsc --noEmit`
  - Perguntar ao usuário se há dúvidas antes de prosseguir.

- [x] 13. Páginas do Dashboard — Knowledge Base

  - [x] 13.1 Implementar página de listagem de Knowledge Bases (`/knowledge-base`)
    - Criar `src/app/(dashboard)/knowledge-base/page.tsx` com componente `KnowledgeBaseList`
    - Exibir lista ordenada por `createdAt` desc; estado vazio quando não há KBs
    - Formulário de criação: campos nome (obrigatório, 1–100) e tipo de catálogo (obrigatório)
    - Validação no cliente: exibir erro por campo; bloquear submissão com campos inválidos
    - Após criação bem-sucedida: redirecionar para `/knowledge-base/[id]`
    - Exibir erro genérico sem redirecionar em caso de erro do servidor; preservar valores do formulário
    - _Requirements: 1.1, 1.2, 1.3, 1.11, 9.6_

  - [x] 13.2 Implementar página de detalhe da Knowledge Base (`/knowledge-base/[id]`)
    - Criar `src/app/(dashboard)/knowledge-base/[id]/page.tsx` com componente `KnowledgeBaseDetail`
    - Exibir nome, tipo, descrição e atalhos para `/fields`, `/records`, `/agent`, `/conversations`
    - Formulário de edição com campos nome e descrição pré-preenchidos
    - Validação: nome 1–100, descrição até 500; erro por campo; bloquear submissão inválida
    - Botão de exclusão: modal de confirmação; se KBAgent ativo, exibir aviso antes do modal
    - Após exclusão confirmada: redirecionar para `/knowledge-base`
    - _Requirements: 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.11_

  - [x] 13.3 Implementar página de gerenciamento de CatalogFields (`/knowledge-base/[id]/fields`)
    - Criar `src/app/(dashboard)/knowledge-base/[id]/fields/page.tsx` com componente `CatalogFieldManager`
    - Listar campos existentes com nome, tipo e flag `isFilterable`
    - Formulário de adição manual: nome, tipo, isFilterable; validação no cliente
    - Botão de upload de CSV para inferência: chamar `/api/.../fields/infer`, exibir campos sugeridos para confirmação/edição antes de salvar
    - Campos ambíguos exibidos como `string`; cliente pode alterar tipo antes de confirmar
    - Botão de exclusão por campo; bloquear adição quando limite de 50 é atingido
    - _Requirements: 2.1, 2.2, 2.3, 2.6, 2.7, 2.8, 2.9, 2.10_

  - [x] 13.4 Implementar página de gerenciamento de CatalogRecords (`/knowledge-base/[id]/records`)
    - Criar `src/app/(dashboard)/knowledge-base/[id]/records/page.tsx` com componente `CatalogRecordManager`
    - Exibir lista paginada (50 por página), ordenada por `createdAt` desc
    - Formulário de criação manual com campos dinâmicos baseados nos CatalogFields da KB
    - Validação de formato por tipo de campo no cliente
    - Upload CSV: input de arquivo, barra de progresso, exibir resultado (criados + erros)
    - Botão de limpeza total: modal de confirmação dedicado; exibir mensagem de sucesso
    - Bloquear criação manual quando limite de 50.000 é atingido
    - _Requirements: 3.4, 3.5, 3.8, 3.9, 3.10_

  - [x] 13.5 Implementar página de configuração do KBAgent (`/knowledge-base/[id]/agent`)
    - Criar `src/app/(dashboard)/knowledge-base/[id]/agent/page.tsx` com componente `KBAgentConfig`
    - Exibir formulário de criação quando não existe KBAgent; formulário de edição quando já existe
    - Exibir `instanceName` como somente leitura na edição
    - Após criação: exibir URL do webhook em destaque (`/api/kb-agent/{agentId}`)
    - Botões: Salvar, Pausar/Reativar (toggle), Excluir (com confirmação)
    - Validação no cliente para todos os campos conforme regras do Requisito 4
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.8, 4.9_

  - [x] 13.6 Implementar página de visualização de conversas (`/knowledge-base/[id]/conversations`)
    - Criar `src/app/(dashboard)/knowledge-base/[id]/conversations/page.tsx` com componente `KBConversationList`
    - Lista de conversas agrupada por `remoteJid`: exibir nome do contato (ou `remoteJid`), prévia dos últimos 100 chars da última mensagem (com reticências), data/hora no formato DD/MM/YYYY HH:mm
    - Paginação: 20 conversas por página; estado vazio quando não há conversas
    - Ao selecionar conversa: exibir histórico completo em ordem cronológica crescente com rótulos "Operador" e "Agente"
    - Mensagens de áudio: indicador visual + texto transcrito (ou aviso de transcrição indisponível se `content` vazio)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

- [ ] 14. Testes de Integração

  - [ ]* 14.1 Escrever teste de integração para o fluxo de upload CSV via rota de API
    - Criar `src/server/__tests__/knowledge-base-agent.integration.test.ts`
    - Usar banco SQLite de teste (via Prisma com `DATABASE_URL` temporário)
    - Criar KnowledgeBase e CatalogFields → fazer upload de CSV válido → verificar CatalogRecords criados
    - Testar CSV com linhas com erro: verificar que registros válidos são criados e erros são reportados
    - _Requirements: 3.1, 3.3_

  - [ ]* 14.2 Escrever teste de integração para o ciclo completo de tool use (webhook)
    - Criar mocks para Bedrock (retornar `tool_use` no primeiro ciclo, texto no segundo) e EvolutionAPI
    - Verificar que `searchToolService.search` é chamado com os filtros corretos
    - Verificar que KBMessages são persistidas (`role = "user"` e `role = "assistant"`)
    - Verificar que CostLog é gravado com tokens acumulados dos dois ciclos
    - _Requirements: 5.4, 5.5, 5.6, 5.7, 5.11, 10.1_

- [x] 15. Checkpoint Final — Verificação de Completude
  - Executar `npx tsc --noEmit` e verificar ausência de erros TypeScript em todos os novos arquivos
  - Executar `npx jest --testPathPattern="knowledge-base|kbAgent|searchTool|csvIngestor|prompt-variables.kb" --run` e verificar que todos os testes passam
  - Verificar que todos os requisitos (1–12) estão cobertos por pelo menos uma task implementada
  - Perguntar ao usuário se há dúvidas antes de finalizar.

---

## Notes

- Tasks marcadas com `*` são opcionais e podem ser puladas para um MVP mais rápido
- Cada task referencia os requisitos correspondentes para rastreabilidade
- Os checkpoints garantem validação incremental antes de avançar para a próxima fase
- Testes de propriedade validam invariantes universais usando fast-check 3.22.0 com mínimo de 100 iterações cada
- Testes unitários validam comportamentos específicos e casos de borda
- A filtragem da SearchTool é feita em memória (JavaScript) para compatibilidade com SQLite em desenvolvimento
- O webhook sempre retorna HTTP 200 (exceto quando KBAgent não é encontrado, retorna 404) para evitar retries da EvolutionAPI

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["2.1", "2.2", "2.3", "2.4"] },
    { "id": 3, "tasks": ["3.1", "3.3", "3.5"] },
    { "id": 4, "tasks": ["3.2", "3.4", "3.6", "5.1", "6.1"] },
    { "id": 5, "tasks": ["5.2", "5.3", "6.2", "6.3", "8.1"] },
    { "id": 6, "tasks": ["5.4", "5.5", "6.4", "8.2"] },
    { "id": 7, "tasks": ["6.5", "7.1", "7.2", "7.3", "7.4"] },
    { "id": 8, "tasks": ["10.1"] },
    { "id": 9, "tasks": ["10.2", "10.3"] },
    { "id": 10, "tasks": ["10.4", "11.1", "11.2", "11.3", "11.4", "11.5"] },
    { "id": 11, "tasks": ["10.5", "13.1", "13.2", "13.3", "13.4", "13.5", "13.6"] },
    { "id": 12, "tasks": ["14.1", "14.2"] }
  ]
}
```
