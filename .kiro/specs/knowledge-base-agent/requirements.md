# Documento de Requisitos: Agente IA com Base de Conhecimento Proprietária

## Introdução

Este documento especifica os requisitos para o módulo **Knowledge Base Agent** — uma extensão da plataforma MKT Digital que permite a cada empresa cliente conectar sua própria base de dados estruturada a um agente de IA acessível via WhatsApp.

O caso de uso central é: um operador final (ex: corretor de imóveis) envia uma mensagem de texto ou áudio para um número WhatsApp dedicado. O agente transcreve o áudio (se necessário), extrai filtros e intenções da mensagem, consulta o catálogo estruturado do cliente (imóveis, produtos, veículos, serviços, etc.) e retorna resultados formatados em linguagem natural.

O módulo é independente do `whatsapp-ai-agent` existente, mas compartilha a mesma infraestrutura de plataforma (Next.js, Prisma, AWS Bedrock, EvolutionAPI, CostLog).

---

## Glossário

- **KnowledgeBase**: Entidade que representa a base de conhecimento proprietária de uma empresa. Contém metadados (nome, tipo de catálogo) e referencia os campos e registros do catálogo.
- **CatalogField**: Definição de um campo/atributo do catálogo (nome, tipo de dado, flag de filtrável). Ex: `preco` (number, filtrável), `cidade` (string, filtrável), `descricao` (text, não filtrável).
- **CatalogRecord**: Um item individual do catálogo (ex: um imóvel, um produto). Armazenado como JSON com os valores dos campos definidos.
- **KBAgent**: Agente WhatsApp vinculado a uma KnowledgeBase. Processa mensagens, consulta a base e responde.
- **KBMessage**: Mensagem individual em uma conversa com o KBAgent (texto ou áudio transcrito).
- **SearchTool**: Função de busca (tool use / function calling) que a IA invoca para consultar a KnowledgeBase com filtros estruturados.
- **Empresa**: Uma instância do modelo `Company` no banco de dados da plataforma.
- **Operador**: Usuário final do cliente (ex: corretor) que conversa com o KBAgent pelo WhatsApp.
- **AWS_Transcribe**: Serviço da AWS utilizado para transcrição de mensagens de áudio do WhatsApp.
- **Bedrock_Service**: Serviço da AWS (Bedrock) que executa o modelo Claude com suporte a tool use.
- **EvolutionAPI**: Serviço utilizado para envio e recebimento de mensagens WhatsApp.
- **CostLog**: Modelo existente na plataforma para registro de custos de IA por empresa.
- **CSV_Ingestor**: Componente responsável por processar uploads de arquivos CSV e criar CatalogRecords.
- **Schema_Inferrer**: Componente que analisa as colunas de um CSV e sugere CatalogFields com tipos de dados.
- **Dashboard**: Interface web da plataforma acessada pelo cliente (empresa).

---

## Requisitos

### Requisito 1: Gerenciamento da Base de Conhecimento

**User Story:** Como cliente da plataforma, quero criar e gerenciar bases de conhecimento, para que eu possa conectar meu catálogo de dados a um agente de IA.

#### Critérios de Aceite

1. WHEN o cliente acessa a seção de Knowledge Base, THE Dashboard SHALL exibir a lista de KnowledgeBases da Empresa autenticada, ordenada por data de criação decrescente.
2. WHEN o cliente submete o formulário de criação com nome válido (1–100 caracteres) e tipo de catálogo selecionado, THE Dashboard SHALL criar uma KnowledgeBase associada à Empresa e redirecioná-lo para a página de configuração da nova base.
3. IF o nome da KnowledgeBase estiver vazio, exceder 100 caracteres, ou o tipo de catálogo não tiver sido selecionado, THEN THE Dashboard SHALL exibir uma mensagem de erro de validação no campo correspondente e bloquear a submissão.
4. WHEN o cliente solicita a edição de uma KnowledgeBase existente, THE Dashboard SHALL exibir o formulário de edição com os campos nome e descrição preenchidos com os valores atuais e habilitados para alteração.
5. WHEN o cliente salva a edição de uma KnowledgeBase com dados válidos (nome 1–100 caracteres, descrição até 500 caracteres), THE Dashboard SHALL persistir as alterações e exibir mensagem de confirmação de sucesso.
6. IF o cliente tenta salvar a edição com nome vazio, nome excedendo 100 caracteres, ou descrição excedendo 500 caracteres, THEN THE Dashboard SHALL exibir mensagem de erro por campo e bloquear a submissão.
7. WHEN o cliente solicita a exclusão de uma KnowledgeBase que não possui KBAgent ativo, THE Dashboard SHALL exibir um modal de confirmação explícito antes de executar a operação.
8. IF a KnowledgeBase a ser excluída possuir um KBAgent com status `active`, THEN THE Dashboard SHALL exibir aviso informando que existe um agente ativo vinculado e que ele também será removido, antes de exibir o modal de confirmação de exclusão.
9. WHEN o cliente confirma a exclusão de uma KnowledgeBase, THE Dashboard SHALL excluir em cascata todos os CatalogFields, CatalogRecords e KBAgents vinculados e redirecionar o cliente para a lista de KnowledgeBases.
10. IF a Empresa autenticada tentar acessar ou modificar uma KnowledgeBase que não pertence a ela via API, THEN THE Sistema SHALL retornar HTTP 403 e nenhum dado da KnowledgeBase SHALL ser retornado ou alterado.
11. IF uma operação de criação ou edição falhar por erro interno do servidor, THEN THE Dashboard SHALL exibir mensagem de erro genérica sem redirecionar, preservando os valores preenchidos no formulário.

---

### Requisito 2: Estrutura do Catálogo (CatalogFields)

**User Story:** Como cliente da plataforma, quero definir os campos do meu catálogo, para que o agente saiba quais atributos existem e quais podem ser usados como filtros de busca.

#### Critérios de Aceite

1. WHEN o cliente cria uma KnowledgeBase, THE Dashboard SHALL inicializar a estrutura de campos com zero CatalogFields, permitindo adição manual ou por inferência via CSV.
2. WHEN o cliente adiciona um CatalogField manualmente com dados válidos, THE Dashboard SHALL registrar nome (1–50 caracteres, alfanumérico e underscores), tipo de dado (`string`, `number`, `boolean`, `date`, `text`) e flag `isFilterable` (padrão `false` se não especificado).
3. IF o nome de um CatalogField já existir na mesma KnowledgeBase, THEN THE Dashboard SHALL retornar um erro de conflito no campo nome e bloquear a criação duplicada.
4. WHEN o cliente marca um CatalogField como `isFilterable = true`, THE SearchTool SHALL utilizar esse campo como parâmetro de filtragem disponível na próxima invocação.
5. WHEN o cliente remove um CatalogField, THE Dashboard SHALL remover o campo e atualizar todos os CatalogRecords existentes para excluir a chave desse campo de seus dados JSON.
6. IF o número de CatalogFields de uma KnowledgeBase já atingiu 50, THEN THE Dashboard SHALL bloquear a criação de novos campos e exibir mensagem informativa sobre o limite.
7. WHEN o cliente carrega um arquivo CSV, THE Schema_Inferrer SHALL analisar o cabeçalho e até 20 linhas de amostra e sugerir CatalogFields com tipos de dado inferidos, apresentando-os para confirmação antes de salvar.
8. IF o tipo inferido pelo Schema_Inferrer for ambíguo para uma coluna, THEN THE Dashboard SHALL apresentar o tipo como `string` por padrão, permitindo que o cliente altere antes de confirmar.
9. IF o cliente tenta adicionar um CatalogField com nome vazio, nome excedendo 50 caracteres, caracteres inválidos (não alfanuméricos e não underscores), ou tipo de dado inválido, THEN THE Dashboard SHALL exibir mensagem de erro por campo e bloquear a criação.
10. IF o arquivo CSV enviado estiver vazio, não contiver linha de cabeçalho, ou não for legível (encoding inválido, arquivo corrompido), THEN THE Schema_Inferrer SHALL rejeitar o arquivo e retornar mensagem de erro descritiva antes de qualquer inferência.

---

### Requisito 3: Ingestão de Dados (CatalogRecords)

**User Story:** Como cliente da plataforma, quero importar e gerenciar registros do meu catálogo, para que o agente tenha dados atualizados para consultar.

#### Critérios de Aceite

1. WHEN o cliente faz upload de um arquivo CSV válido (UTF-8, delimitado por vírgula, cabeçalho na primeira linha) com colunas correspondentes — por correspondência exata de nome, case-sensitive — aos CatalogFields definidos, THE CSV_Ingestor SHALL criar um CatalogRecord para cada linha de dados do CSV, armazenando os valores das colunas reconhecidas como JSON (colunas não reconhecidas são ignoradas).
2. IF o arquivo CSV exceder 10 MB ou contiver mais de 10.000 linhas de dados, THEN THE CSV_Ingestor SHALL rejeitar o upload antes do processamento e retornar mensagem de erro descritiva informando o limite violado.
3. IF uma linha do CSV contiver valor inválido para um campo do tipo `number` (esperado: decimal com separador `.`) ou `date` (esperado: YYYY-MM-DD), THEN THE CSV_Ingestor SHALL registrar o erro para essa linha, continuar processando as demais, e retornar na resposta do upload o número total de linhas processadas com sucesso e o número de linhas com erro.
4. WHEN o cliente cadastra um CatalogRecord manualmente com todos os campos válidos, THE Dashboard SHALL apresentar formulário com os CatalogFields da KnowledgeBase e salvar os valores fornecidos como JSON.
5. IF o cliente tenta salvar um CatalogRecord manualmente com valor de formato inválido para um campo (ex: texto em campo `number`, data fora do formato YYYY-MM-DD), THEN THE Dashboard SHALL exibir mensagem de erro por campo indicando o formato esperado e bloquear a criação até que os erros sejam corrigidos.
6. WHEN o cliente edita um CatalogRecord existente com dados válidos, THE Dashboard SHALL atualizar os valores do registro sem alterar os demais registros da KnowledgeBase.
7. WHEN o cliente exclui um CatalogRecord, THE Dashboard SHALL remover o registro permanentemente.
8. WHEN o cliente navega pela lista de CatalogRecords de uma KnowledgeBase, THE Dashboard SHALL exibir os registros paginados com no máximo 50 por página, ordenados por data de criação decrescente.
9. IF o upload de CSV resultaria em um total de CatalogRecords na KnowledgeBase superior a 50.000, THEN THE CSV_Ingestor SHALL rejeitar o upload completo e retornar mensagem informando o limite e a quantidade atual de registros. IF o total atual já atingiu 50.000, THEN THE Dashboard SHALL bloquear a criação manual de novos registros exibindo mensagem informativa.
10. WHEN o cliente solicita a limpeza total da KnowledgeBase, THE Dashboard SHALL exibir um modal de confirmação com botão de confirmação dedicado e, após confirmação, excluir todos os CatalogRecords sem alterar os CatalogFields, exibindo mensagem de sucesso após conclusão.

---

### Requisito 4: Configuração do KBAgent

**User Story:** Como cliente da plataforma, quero configurar um agente WhatsApp vinculado à minha base de conhecimento, para que meus operadores possam consultar o catálogo por mensagem.

#### Critérios de Aceite

1. IF a KnowledgeBase já possuir um KBAgent, THEN THE Dashboard SHALL bloquear a criação de um segundo KBAgent e exibir mensagem informando que apenas um agente é permitido por base de conhecimento.
2. WHEN o cliente cria um KBAgent, THE Dashboard SHALL solicitar: nome (1–100 caracteres), `instanceName` (1–60 caracteres, alfanumérico e hífens), URL da EvolutionAPI (URL válida com prefixo `http://` ou `https://`), chave de API da EvolutionAPI (não vazia), prompt de sistema (10–5.000 caracteres), delay entre mensagens em segundos (inteiro 1–60), e limite diário de mensagens por número (inteiro 1–500).
3. IF o `instanceName` já existir para a mesma Empresa em qualquer KBAgent ou WhatsAppAgent existente, THEN THE Dashboard SHALL retornar erro de conflito no campo `instanceName` e bloquear a criação.
4. WHEN o cliente salva o KBAgent com dados válidos, THE Dashboard SHALL criar o registro com status padrão `active` e exibir a URL do webhook que deve ser configurada na EvolutionAPI no formato `/api/kb-agent/{agentId}`.
5. WHEN o cliente edita um KBAgent existente, THE Dashboard SHALL permitir alterar todos os campos exceto `instanceName`, que SHALL ser exibido como somente leitura.
6. THE Dashboard SHALL permitir pausar e reativar um KBAgent individualmente, alterando seu status entre `active` e `paused`.
7. IF o KBAgent estiver com status `paused`, THEN THE KBAgent SHALL retornar HTTP 200 em até 100 ms para todos os webhooks recebidos sem processar a mensagem nem interagir com serviços externos.
8. WHEN o cliente exclui um KBAgent, THE Dashboard SHALL remover o registro e todas as KBMessages associadas via cascade delete.
9. IF o cliente tenta salvar um KBAgent (criação ou edição) com qualquer campo fora do intervalo permitido ou formato inválido, THEN THE Dashboard SHALL exibir mensagem de erro por campo correspondente e bloquear a submissão.

---

### Requisito 5: Processamento de Mensagens de Texto

**User Story:** Como operador do cliente, quero enviar mensagens de texto para o KBAgent pelo WhatsApp, para que ele consulte a base e responda com informações relevantes.

#### Critérios de Aceite

1. IF o KBAgent recebido pelo webhook estiver com status `paused`, THEN THE KBAgent SHALL retornar HTTP 200 imediatamente sem processar a mensagem.
2. IF o campo `remoteJid` da mensagem recebida for igual ao `instanceName` do KBAgent (loop guard), THEN THE KBAgent SHALL retornar HTTP 200 sem processar.
3. IF o número de KBMessages com `role = "user"` do número remetente no dia UTC corrente já atingir o valor de `maxMessagesPerDay` do KBAgent, THEN THE KBAgent SHALL retornar HTTP 200 sem processar e sem enviar resposta ao Operador.
4. WHEN o KBAgent processa uma mensagem de texto válida (não bloqueada pelos critérios 1–3), THE KBAgent SHALL persistir a mensagem com `role = "user"` e `messageType = "text"` antes de invocar o Bedrock_Service.
5. WHEN o KBAgent invoca o Bedrock_Service, THE KBAgent SHALL incluir as últimas 20 KBMessages da conversa do número remetente (ordenadas por `createdAt` ascendente) como histórico e disponibilizar a SearchTool como ferramenta disponível para invocação.
6. WHEN o Bedrock_Service invoca a SearchTool, THE SearchTool SHALL executar a busca na KnowledgeBase com os filtros extraídos e retornar até 10 CatalogRecords correspondentes.
7. WHEN a SearchTool retorna resultados, THE KBAgent SHALL formatar a resposta listando os itens encontrados com seus campos relevantes e enviá-la ao número remetente via EvolutionAPI.
8. IF a SearchTool não encontrar resultados para os filtros fornecidos, THEN THE KBAgent SHALL gerar e enviar ao Operador uma resposta em linguagem natural informando que nenhum item foi encontrado com os critérios especificados.
9. IF o Bedrock_Service retornar erro durante a invocação, THEN THE KBAgent SHALL registrar o erro no log do servidor e retornar HTTP 200 sem enviar mensagem ao Operador.
10. IF a EvolutionAPI retornar HTTP 401 ou 403 ao enviar a resposta, THEN THE KBAgent SHALL interromper o envio, registrar o erro no log do servidor e retornar HTTP 200.
11. WHEN o KBAgent conclui o envio da resposta com sucesso, THE KBAgent SHALL persistir cada parte da resposta como KBMessage com `role = "assistant"` e gravar um CostLog com `companyId`, `type = "kb_agent_text"`, modelo Bedrock utilizado, `inputTokens` e `outputTokens` acumulados de todos os ciclos de invocação (incluindo ciclos de tool use), `costUsd` calculado e `metadata` contendo `agentId` e `remoteJid`.

---

### Requisito 6: Processamento de Mensagens de Áudio

**User Story:** Como operador do cliente, quero enviar mensagens de voz para o KBAgent pelo WhatsApp, para que ele transcreva e processe como se fosse texto.

#### Critérios de Aceite

1. WHEN o webhook do KBAgent recebe uma mensagem de tipo `audioMessage` ou `pttMessage`, THE KBAgent SHALL baixar o arquivo de áudio da EvolutionAPI e enviá-lo ao AWS_Transcribe para transcrição.
2. WHEN o AWS_Transcribe retorna a transcrição com conteúdo não vazio, THE KBAgent SHALL persistir a mensagem com `role = "user"`, `messageType = "audio"` e o texto transcrito como `content`.
3. WHEN a transcrição for concluída com texto não vazio, THE KBAgent SHALL invocar o Bedrock_Service com as últimas 20 KBMessages da conversa do número remetente como histórico e a SearchTool disponível, formatar a resposta com os resultados e enviá-la ao Operador via EvolutionAPI.
4. IF o download do arquivo de áudio da EvolutionAPI falhar, o AWS_Transcribe retornar erro, ou a transcrição resultar em texto vazio, THEN THE KBAgent SHALL registrar o erro no log do servidor, retornar HTTP 200 e enviar ao Operador uma mensagem informando que não foi possível processar o áudio.
5. WHEN o KBAgent conclui o processamento de um áudio com sucesso, THE KBAgent SHALL registrar dois CostLogs separados: um com `type = "kb_agent_transcription"`, `model = "aws-transcribe"`, `costUsd` calculado com base na duração do áudio em segundos e `metadata` com `agentId` e duração; e outro com `type = "kb_agent_text"` conforme Requisito 5, Critério 11.
6. IF o áudio recebido exceder 300 segundos de duração, THEN THE KBAgent SHALL retornar HTTP 200 sem processar e enviar ao Operador mensagem informando que o áudio excede o limite máximo de 5 minutos.

---

### Requisito 7: Ferramenta de Busca (SearchTool)

**User Story:** Como sistema, preciso de uma ferramenta de busca que a IA possa invocar para consultar a base de conhecimento com filtros estruturados.

#### Critérios de Aceite

1. THE SearchTool SHALL aceitar um objeto de filtros onde cada chave é o nome de um CatalogField com `isFilterable = true` e o valor é o critério de busca; chaves que não correspondam a um CatalogField filtrável da KnowledgeBase SHALL ser ignoradas.
2. WHEN a SearchTool recebe filtros para campos do tipo `number`, THE SearchTool SHALL suportar os operadores: `eq` (igual), `gte` (maior ou igual), `lte` (menor ou igual), `between` (objeto com propriedades `min` e `max`, inclusivo em ambos os extremos).
3. WHEN a SearchTool recebe filtros para campos do tipo `string`, THE SearchTool SHALL aplicar busca case-insensitive com correspondência parcial (LIKE `%valor%`).
4. WHEN a SearchTool recebe filtros para campos do tipo `boolean`, THE SearchTool SHALL aplicar correspondência exata ao valor booleano.
5. WHEN a SearchTool recebe filtros para campos do tipo `date`, THE SearchTool SHALL suportar os operadores `eq`, `gte` e `lte` com valores no formato YYYY-MM-DD.
6. THE SearchTool SHALL retornar no máximo 10 CatalogRecords por invocação. WHEN múltiplos filtros são fornecidos, os registros retornados SHALL satisfazer todos os filtros (operação AND). Os registros SHALL ser ordenados pelo número de filtros satisfeitos em ordem decrescente.
7. IF nenhum filtro válido for fornecido, THEN THE SearchTool SHALL retornar os 10 CatalogRecords mais recentes da KnowledgeBase (ordenados por `createdAt` decrescente).
8. THE SearchTool SHALL garantir que a busca opere exclusivamente nos CatalogRecords da KnowledgeBase vinculada ao KBAgent que originou a invocação.
9. IF um campo referenciado no filtro não existir como CatalogField da KnowledgeBase ou não tiver `isFilterable = true`, THEN THE SearchTool SHALL ignorar esse filtro sem retornar erro, aplicando apenas os filtros válidos restantes.

---

### Requisito 8: Visualização de Conversas no Dashboard

**User Story:** Como cliente da plataforma, quero visualizar as conversas que meus operadores tiveram com o KBAgent, para que eu possa monitorar o uso e a qualidade das respostas.

#### Critérios de Aceite

1. WHEN o cliente acessa a página de conversas de um KBAgent, THE Dashboard SHALL exibir a lista de conversas agrupada por `remoteJid`, mostrando: nome do contato (quando disponível, caso contrário o `remoteJid`), prévia dos últimos 100 caracteres da última mensagem (com reticências se truncado) e data/hora da última interação no formato DD/MM/YYYY HH:mm, ordenada de forma decrescente.
2. WHEN o cliente seleciona uma conversa, THE Dashboard SHALL exibir o histórico completo de mensagens do `remoteJid` em ordem cronológica crescente, com rótulos visuais "Operador" para `role = "user"` e "Agente" para `role = "assistant"`, e timestamp de cada mensagem no formato DD/MM/YYYY HH:mm.
3. IF uma mensagem tiver `messageType = "audio"` e `content` não vazio, THEN THE Dashboard SHALL exibir um indicador visual de áudio junto ao texto transcrito.
4. IF uma mensagem tiver `messageType = "audio"` e `content` vazio ou nulo, THEN THE Dashboard SHALL exibir um indicador visual de áudio com rótulo informando que a transcrição não está disponível.
5. THE Dashboard SHALL suportar paginação na lista de conversas com no máximo 20 conversas por página.
6. IF a Empresa autenticada tentar acessar conversas de um KBAgent que não pertence a ela, THEN THE Dashboard SHALL retornar HTTP 403 e exibir mensagem de erro sem expor dados da conversa.
7. IF o KBAgent não possuir nenhuma conversa, THEN THE Dashboard SHALL exibir uma mensagem informativa de estado vazio indicando que nenhuma conversa foi registrada ainda.

---

### Requisito 9: Limites, Segurança e Isolamento

**User Story:** Como plataforma, preciso garantir isolamento de dados entre empresas e limites de uso para evitar abusos.

#### Critérios de Aceite

1. WHEN qualquer operação de leitura ou escrita de CatalogRecords, KBAgents ou KBMessages for solicitada via API com sessão autenticada, THE Sistema SHALL verificar que o recurso pertence à Empresa da sessão antes de executar.
2. IF a verificação de propriedade falhar (recurso de outra Empresa ou não existente), THEN THE Sistema SHALL retornar HTTP 403 sem executar a operação e sem retornar dados do recurso.
3. IF o campo `remoteJid` da mensagem recebida no webhook for igual ao `instanceName` do KBAgent (loop guard), THEN THE KBAgent SHALL retornar HTTP 200 sem processar a mensagem.
4. THE KBAgent SHALL contar as KBMessages com `role = "user"` do número remetente dentro do dia UTC corrente (de 00:00:00 a 23:59:59 UTC) e bloquear o processamento quando o total atingir o valor de `maxMessagesPerDay` configurado no KBAgent.
5. IF uma requisição à instância EvolutionAPI corrente retornar HTTP 401 ou 403, THEN THE KBAgent SHALL interromper imediatamente o envio de mensagens na invocação atual, registrar o erro no log do servidor e retornar HTTP 200 ao webhook.
6. IF o número de KnowledgeBases ativas de uma Empresa já atingiu 10, THEN THE Dashboard SHALL bloquear a criação de uma nova KnowledgeBase e exibir mensagem informativa sobre o limite.
7. IF qualquer serviço externo (Bedrock, EvolutionAPI, AWS Transcribe) retornar erro durante o processamento do webhook, THEN THE KBAgent SHALL registrar os detalhes do erro no log do servidor e retornar HTTP 200 ao chamador sem expor informações internas no corpo da resposta.

---

### Requisito 10: Rastreamento de Custos

**User Story:** Como cliente da plataforma, quero que todos os custos de IA e transcrição sejam registrados, para que eu possa acompanhar os gastos do KBAgent.

#### Critérios de Aceite

1. WHEN o KBAgent conclui o processamento de uma mensagem de texto com invocação bem-sucedida do Bedrock_Service, THE KBAgent SHALL gravar um CostLog com `companyId`, `type = "kb_agent_text"`, modelo Bedrock utilizado, `inputTokens` e `outputTokens` representando o total acumulado de todos os ciclos de invocação Bedrock da mesma mensagem (incluindo ciclos de tool use), `costUsd` calculado e `metadata` (JSON) contendo `agentId` e `remoteJid`.
2. WHEN o KBAgent conclui a transcrição de um áudio com resultado não vazio, THE KBAgent SHALL gravar um CostLog com `companyId`, `type = "kb_agent_transcription"`, `model = "aws-transcribe"`, `costUsd` calculado com base na duração do áudio em segundos (no intervalo 1–300), `inputTokens = 0`, `outputTokens = 0` e `metadata` (JSON) contendo `agentId` e duração em segundos.
3. THE Dashboard SHALL exibir os CostLogs do tipo `kb_agent_text` e `kb_agent_transcription` na visão de custos existente da plataforma, agrupados por empresa.
4. IF a resposta do Bedrock_Service não incluir dados de uso de tokens (`inputTokens` ou `outputTokens` ausentes ou nulos), THEN THE KBAgent SHALL registrar o CostLog com `inputTokens = 0`, `outputTokens = 0` e `costUsd = 0` em vez de omiti-lo.
5. IF a gravação do CostLog falhar por erro de persistência, THEN THE KBAgent SHALL registrar o erro no log do servidor e continuar o processamento sem interromper o fluxo de resposta ao Operador.

---

### Requisito 11: Modelo de Dados (Schema Prisma)

**User Story:** Como sistema, preciso de um schema de banco de dados que suporte todos os requisitos anteriores de forma eficiente e com isolamento por empresa.

#### Critérios de Aceite

1. THE Sistema SHALL implementar o modelo `KnowledgeBase` com os campos: `id` (cuid), `companyId` (FK Company, cascade delete), `name` (string, min 1, max 100), `description` (string, opcional), `catalogType` (string, min 1, max 50), `createdAt`, `updatedAt`, e índice em `companyId`.
2. THE Sistema SHALL implementar o modelo `CatalogField` com os campos: `id` (cuid), `knowledgeBaseId` (FK KnowledgeBase, cascade delete), `name` (string, min 1, max 50), `dataType` (string: `string`|`number`|`boolean`|`date`|`text`), `isFilterable` (boolean, default `false`), `displayOrder` (int, default `0`), e `@@unique([knowledgeBaseId, name])`.
3. THE Sistema SHALL implementar o modelo `CatalogRecord` com os campos: `id` (cuid), `knowledgeBaseId` (FK KnowledgeBase, cascade delete), `data` (string, JSON serializado), `createdAt`, `updatedAt`, e índice em `knowledgeBaseId`.
4. THE Sistema SHALL implementar o modelo `KBAgent` com os campos: `id` (cuid), `knowledgeBaseId` (FK KnowledgeBase, cascade delete, `@@unique`), `companyId` (FK Company, cascade delete), `name` (string, min 1, max 100), `instanceName` (string, min 1, max 60), `evolutionApiUrl` (string), `evolutionApiKey` (string), `systemPrompt` (string, min 10, max 5000), `delaySeconds` (int, default `3`, range 1–60), `maxMessagesPerDay` (int, default `50`, range 1–500), `status` (string, default `active`, valores: `active`|`paused`), `createdAt`, `updatedAt`, `@@unique([companyId, instanceName])` e índices em `companyId` e `knowledgeBaseId`.
5. THE Sistema SHALL implementar o modelo `KBMessage` com os campos: `id` (cuid), `agentId` (FK KBAgent, cascade delete), `remoteJid` (string), `contactName` (string, opcional), `role` (string: `user`|`assistant`), `content` (string), `messageType` (string: `text`|`audio`), `createdAt`, e índices em `[agentId]`, `[agentId, remoteJid]` e `[agentId, remoteJid, createdAt]`.
6. WHEN uma KnowledgeBase é excluída, THE Sistema SHALL excluir em cascata todos os CatalogFields, CatalogRecords, KBAgents e KBMessages associados.
7. THE Sistema SHALL adicionar a relação `knowledgeBases KnowledgeBase[]` ao modelo `Company` existente.

---

### Requisito 12: Propriedades de Corretude

**User Story:** Como engenheiro de qualidade, quero que as propriedades invariantes do sistema sejam verificadas por testes baseados em propriedades, para garantir a corretude do comportamento em cenários arbitrários.

#### Critérios de Aceite

1. THE Sistema SHALL garantir que para qualquer CatalogRecord com campos dos tipos `string`, `number`, `boolean`, `date` ou `text`, `JSON.parse(JSON.stringify(record.data))` produza um objeto com as mesmas chaves e valores, verificado por comparação profunda campo a campo — propriedade round-trip de serialização.
2. THE SearchTool SHALL retornar apenas CatalogRecords que satisfaçam todos os filtros fornecidos; registros com valor ausente ou nulo para um campo filtrado SHALL ser excluídos do resultado — propriedade de corretude de filtros (nenhum falso positivo).
3. THE SearchTool SHALL retornar no máximo 10 CatalogRecords por invocação, independentemente do tamanho da KnowledgeBase — propriedade de limite de resultados (invariante de tamanho de saída).
4. WHEN o KBAgent processa uma mensagem com sucesso (confirmado pelo retorno HTTP 2xx da EvolutionAPI), THE KBAgent SHALL ter persistido exatamente uma KBMessage com `role = "user"` e ao menos uma KBMessage com `role = "assistant"` para aquela interação — propriedade de persistência completa.
5. THE CSV_Ingestor SHALL garantir que para todo CSV com N linhas de dados válidas, o resultado da importação satisfaça `registrosCriados + linhasComErro = N` — propriedade de conservação de contagem.
6. WHEN o Dashboard alterna o status de um KBAgent via operação de toggle, THE Dashboard SHALL garantir que se o status anterior era `active` o novo status é `paused`, e se era `paused` o novo status é `active` — propriedade de complemento de toggle.
7. THE KBAgent SHALL garantir que todo systemPrompt contendo as variáveis `{{agentName}}` e/ou `{{today}}` tenha todas as ocorrências substituídas antes do envio ao Bedrock_Service, onde `{{agentName}}` é substituído pelo valor do campo `KBAgent.name` e `{{today}}` é substituído pela data atual no formato YYYY-MM-DD em UTC — propriedade de substituição completa de variáveis.
8. THE SearchTool SHALL garantir que para qualquer busca com N filtros combinados (AND), o conjunto de resultados retornado seja subconjunto do resultado de cada filtro individual aplicado isoladamente — propriedade metamórfica de filtros compostos (`|filtros_combinados| ≤ |filtro_individual_i|` para todo i).
