# Documento de Requisitos

## Introduction

Esta feature adiciona à plataforma de marketing digital dois novos fluxos de criação de reels: (1) upload de vídeo com geração de legenda e hashtags via IA, e (2) upload de vídeo com legenda manual e publicação direta. Ambos os fluxos se integram ao modelo `Post` existente usando `format="reel"`, reutilizam os componentes e APIs já disponíveis, e são acessíveis a partir de uma nova página de seleção de modo em `/video/new`. A página `/video` é expandida com uma aba dedicada para listar reels agendados.

---

## Glossário

- **Reel**: Post de vídeo curto com `format="reel"`, armazenado no modelo `Post` do banco de dados
- **ReelPost**: Estrutura de dados representando um post com `format="reel"`, `imageUrl` contendo a URL do vídeo
- **ModeSelector**: Componente que exibe as três opções de criação de vídeo na página `/video/new`
- **VideoCreationMode**: Enum com os valores `"ai-pipeline"`, `"upload-caption"` e `"upload-publish"`
- **ReelCaptionWizard**: Componente wizard de 3 etapas para upload de vídeo + geração de legenda por IA + salvar/agendar
- **ReelUploadPublish**: Componente para upload de vídeo com legenda manual, seleção de plataformas e agendamento
- **VideoPlatformSelector**: Componente de seleção múltipla restrito às plataformas de vídeo (Instagram Reels, TikTok, YouTube Shorts)
- **ReelGallerySection**: Componente que exibe os posts com `format="reel"` na página `/video`
- **UploadAPI**: Endpoint `POST /api/upload` responsável por receber e persistir arquivos no diretório `public/uploads/`
- **CaptionAPI**: Endpoint `POST /api/generate/reel-caption` responsável por gerar legenda e hashtags via IA (Amazon Bedrock)
- **PostsAPI**: Endpoint `POST /api/posts` e `GET /api/posts` para criação e listagem de posts
- **PostService**: Serviço interno `postService` que encapsula a lógica de negócio de criação e listagem de posts
- **PostRepository**: Camada de acesso a dados que interage com o Prisma para persistir e recuperar posts
- **buildFinalCaption**: Função pura que combina uma legenda e um array de hashtags em um texto final
- **ScheduleAndSave**: Componente compartilhado para seleção de data de agendamento e ação de salvar/publicar
- **VideoGalleryGrid**: Componente existente que exibe VideoJobs gerados pelo pipeline de IA
- **VideoTab**: Enum com os valores `"ai-jobs"` e `"reels"` para o sistema de abas da página `/video`

---

## Requirements

### Requirement 1: Seleção de Modo de Criação de Vídeo

**User Story:** Como criador de conteúdo, quero escolher entre três modos de criação de vídeo na página `/video/new`, para que eu possa selecionar o fluxo que melhor atende minha necessidade.

#### Acceptance Criteria

1. THE `ModeSelector` SHALL exibir três opções de criação: "IA Avançada" (`ai-pipeline`), "Upload + Legenda IA" (`upload-caption`) e "Upload + Publicar" (`upload-publish`)
2. WHEN um usuário seleciona o modo "IA Avançada", THE `ModeSelector` SHALL renderizar o componente `VideoWizard` existente e desmontar qualquer outro modo previamente ativo
3. WHEN um usuário seleciona o modo "Upload + Legenda IA", THE `ModeSelector` SHALL renderizar o componente `ReelCaptionWizard` e desmontar qualquer outro modo previamente ativo
4. WHEN um usuário seleciona o modo "Upload + Publicar", THE `ModeSelector` SHALL renderizar o componente `ReelUploadPublish` e desmontar qualquer outro modo previamente ativo
5. WHILE o modo "IA Avançada" está ativo, THE `ModeSelector` SHALL aplicar destaque visual azul ao card correspondente; WHILE o modo "Upload + Legenda IA" está ativo, THE `ModeSelector` SHALL aplicar destaque roxo; WHILE o modo "Upload + Publicar" está ativo, THE `ModeSelector` SHALL aplicar destaque verde
6. WHEN a página `/video/new` carrega pela primeira vez, THE `ModeSelector` SHALL exibir o modo `"ai-pipeline"` como padrão ativo, com destaque azul e o componente `VideoWizard` renderizado
7. WHEN um usuário troca de modo enquanto há estado não salvo no modo anterior (ex.: vídeo uploaded), THE `ModeSelector` SHALL redefinir o estado interno do novo modo para seu estado inicial vazio
8. IF a página `/video/new` falhar ao renderizar o componente `VideoWizard` ou ao estabelecer o estado padrão `ai-pipeline`, THEN THE `ModeSelector` SHALL exibir uma mensagem de erro e bloquear todas as interações até que o estado padrão seja corretamente estabelecido

---

### Requirement 2: Upload de Vídeo

**User Story:** Como criador de conteúdo, quero fazer upload de um arquivo de vídeo para a plataforma, para que eu possa usá-lo como base para o meu reel.

#### Critérios de Aceitação

1. THE `ReelCaptionWizard` SHALL exibir na Etapa 1 uma dropzone reutilizável que comunica ao usuário os formatos aceitos (MP4, MOV, WebM) e o limite de tamanho de 500 MB
2. THE `ReelUploadPublish` SHALL exibir a mesma dropzone reutilizável com idêntica mensagem de formatos aceitos (MP4, MOV, WebM) e limite de tamanho de 500 MB
3. WHEN um usuário seleciona um arquivo de vídeo com tamanho superior a 500 MB, THE sistema SHALL rejeitar o arquivo sem iniciar o upload e exibir uma mensagem de erro indicando o limite de 500 MB
4. WHEN um usuário seleciona um arquivo com tipo MIME diferente de `video/mp4`, `video/mov`, `video/quicktime` ou `video/webm`, THE sistema SHALL rejeitar o arquivo sem iniciar o upload e exibir mensagem de erro indicando os formatos aceitos
5. WHEN um usuário seleciona um arquivo de vídeo com formato aceito e tamanho até 500 MB, THE sistema SHALL enviar o arquivo para a `UploadAPI` usando `FormData` com o campo `"files"`
6. WHEN a `UploadAPI` retorna sucesso, THE sistema SHALL armazenar internamente a URL e o nome do arquivo retornados no campo `files[0]`
7. IF a `UploadAPI` retornar uma resposta de erro explícita, THEN THE sistema SHALL exibir uma mensagem de erro inline na zona de upload e manter o wizard na etapa de upload
8. WHILE o upload está em progresso, THE sistema SHALL exibir barra de progresso com percentual de 0% a 100% e desabilitar interações na dropzone
9. IF a `UploadAPI` retornar nem sucesso nem erro explícito (ex.: timeout ou falha de rede), THEN THE sistema SHALL tratar a resposta como erro e exibir mensagem de erro inline na zona de upload

---

### Requirement 3: Geração de Legenda por IA (ReelCaptionWizard)

**User Story:** Como criador de conteúdo, quero gerar automaticamente legenda e hashtags para o meu reel usando IA, para que eu possa criar conteúdo engajador de forma rápida.

#### Critérios de Aceitação

1. THE `ReelCaptionWizard` SHALL organizar o fluxo em três etapas sequenciais: (1) Upload de vídeo, (2) Geração de legenda, (3) Revisão e salvar
2. WHEN o upload do vídeo é concluído com sucesso, THE `ReelCaptionWizard` SHALL avançar automaticamente para a Etapa 2
3. THE `ReelCaptionWizard` SHALL exibir na Etapa 2 um campo de texto de até 500 caracteres para o usuário informar ideia ou contexto do vídeo e um `VideoPlatformSelector`
4. WHILE o vídeo não foi uploaded com sucesso, THE `ReelCaptionWizard` SHALL manter o botão "Gerar Legenda" desabilitado
5. WHEN um usuário clica em "Gerar Legenda" com vídeo uploaded e pelo menos uma plataforma selecionada, THE `ReelCaptionWizard` SHALL enviar `{ idea, platform }` para a `CaptionAPI` com o valor da primeira plataforma selecionada
6. WHILE a `CaptionAPI` está processando, THE `ReelCaptionWizard` SHALL exibir indicador de carregamento e desabilitar o botão "Gerar Legenda"; THE indicador de carregamento SHALL permanecer visível até a próxima interação do usuário ou transição de etapa após o processamento
7. WHEN a `CaptionAPI` retorna sucesso, THE `ReelCaptionWizard` SHALL avançar para a Etapa 3 e preencher a textarea de legenda com o `caption` retornado e exibir as hashtags retornadas, mesmo que a quantidade de hashtags seja inferior a 5
8. IF a `CaptionAPI` retornar erro, THEN THE `ReelCaptionWizard` SHALL exibir alerta de erro indicando a causa da falha e manter o wizard na Etapa 2 com a URL do vídeo já uploaded preservada
9. THE `ReelCaptionWizard` SHALL exibir na Etapa 3 uma textarea editável com a legenda gerada, as hashtags retornadas exibidas como tags visuais (5 a 30 tags), e o componente `ScheduleAndSave`
10. WHILE a textarea de legenda na Etapa 3 está vazia ou contém apenas espaços em branco, THE `ReelCaptionWizard` SHALL manter o botão "Salvar" desabilitado

---

### Requirement 4: Upload com Legenda Manual e Publicação (ReelUploadPublish)

**User Story:** Como criador de conteúdo, quero fazer upload de um vídeo e escrever a legenda manualmente, para que eu possa publicar ou agendar o reel diretamente nas plataformas escolhidas.

#### Critérios de Aceitação

1. THE `ReelUploadPublish` SHALL exibir em um único formulário: dropzone de vídeo, textarea para legenda manual com limite de 2200 caracteres, `VideoPlatformSelector` e componente `ScheduleAndSave`
2. WHILE o usuário tem vídeo uploaded e legenda com ao menos 1 caractere não-branco, THE `ReelUploadPublish` SHALL habilitar o botão de salvar, independentemente do número de plataformas selecionadas
3. IF o botão de salvar for acionado sem vídeo uploaded ou com legenda vazia, THEN THE `ReelUploadPublish` SHALL exibir mensagem de validação indicando especificamente quais dos dois campos obrigatórios estão faltando
4. WHEN um usuário submete o formulário com vídeo uploaded, legenda de 1 a 2200 caracteres e nenhuma plataforma selecionada, THE `ReelUploadPublish` SHALL chamar `POST /api/posts` com `{ content, imageUrl: videoUrl, format: "reel", scheduledAt? }` sem campo `platform`, salvando o conteúdo como rascunho; IF o campo `caption_has_content` for `true`, THE sistema SHALL salvar como rascunho independentemente do comprimento textual da legenda
5. WHEN um usuário submete o formulário com vídeo uploaded, legenda de 1 a 2200 caracteres e ao menos uma plataforma selecionada, THE `ReelUploadPublish` SHALL chamar `POST /api/posts` com `{ platform, content, imageUrl: videoUrl, format: "reel", scheduledAt? }` para cada plataforma selecionada em paralelo
6. WHEN todos os posts são criados com sucesso, THE `ReelUploadPublish` SHALL redirecionar o usuário para `/posts`

---

### Requirement 5: Seleção de Plataformas de Vídeo

**User Story:** Como criador de conteúdo, quero selecionar em quais plataformas de vídeo publicar meu reel, para que eu possa distribuir conteúdo nos canais certos.

#### Critérios de Aceitação

1. THE `VideoPlatformSelector` SHALL exibir exclusivamente as três plataformas: Instagram Reels, TikTok e YouTube Shorts
2. THE `VideoPlatformSelector` SHALL permitir seleção de 1 a 3 plataformas simultaneamente
3. WHILE TikTok está selecionado, THE `VideoPlatformSelector` SHALL exibir aviso informativo de que a publicação requer app aprovado pela plataforma; quando TikTok for desmarcado, o aviso SHALL desaparecer; o aviso NÃO SHALL ser exibido durante o carregamento inicial do componente nem quando erros de validação ocorrem sem TikTok selecionado
4. WHILE duas ou mais plataformas estão selecionadas, THE `VideoPlatformSelector` SHALL exibir contador indicando "X posts serão criados (1 post por plataforma selecionada)"
5. WHILE nenhuma plataforma está selecionada, THE `VideoPlatformSelector` SHALL manter desabilitado o botão de prosseguir do componente pai que depende da seleção
6. WHEN ao menos uma plataforma é selecionada, THE `VideoPlatformSelector` SHALL habilitar o botão de prosseguir do componente pai que depende da seleção; o botão SHALL permanecer habilitado independentemente do status de APIs externas das plataformas

---

### Requirement 6: Construção da Legenda Final

**User Story:** Como criador de conteúdo, quero que minha legenda e hashtags sejam combinadas em um texto final coerente, para que o post publicado contenha toda a informação relevante.

#### Critérios de Aceitação

1. WHEN `buildFinalCaption` recebe uma legenda e uma lista não vazia de hashtags, THE `buildFinalCaption` SHALL retornar exatamente a legenda seguida de dois caracteres de nova linha (`\n\n`) e as hashtags unidas por um único espaço
2. IF `buildFinalCaption` receber uma lista vazia ou nula de hashtags, THEN THE `buildFinalCaption` SHALL retornar exatamente a string da legenda sem nenhum caractere adicional
3. IF o resultado combinado de `buildFinalCaption` exceder 2200 caracteres, THEN THE `buildFinalCaption` SHALL retornar um erro sem truncar ou modificar o conteúdo; IF o resultado combinado estiver dentro do limite de 2200 caracteres, THEN THE `buildFinalCaption` SHALL retornar a legenda concatenada com `\n\n` seguida das hashtags unidas por espaço, conforme AC 6.1

---

### Requirement 7: Criação de Post Reel via API

**User Story:** Como desenvolvedor, quero que a API de posts suporte a criação e listagem de posts com `format="reel"`, para que os reels possam ser gerenciados pelo sistema de posts existente.

#### Critérios de Aceitação

1. WHEN `POST /api/posts` recebe um body com `format: "reel"`, THE `PostsAPI` SHALL extrair e encaminhar o campo `format` ao `PostService`, que o repassa ao `PostRepository` para persistência
2. THE `PostService` SHALL aceitar `platform` com os valores `"instagram"`, `"facebook"`, `"linkedin"`, `"whatsapp"`, `"tiktok"` e `"youtube"` ao criar posts sem retornar erro de validação de plataforma
3. IF `format` é `"reel"` e `imageUrl` é nulo ou ausente, THEN THE `PostService` SHALL rejeitar a criação e retornar erro de validação indicando que `imageUrl` é obrigatório para reels
4. IF `format` é `"reel"` e `content` é nulo, ausente ou contém apenas espaços em branco, THEN THE `PostService` SHALL rejeitar a criação e retornar erro de validação indicando que `content` é obrigatório para reels
5. WHEN `scheduledAt` é uma string ISO 8601 estritamente no futuro em relação ao momento da requisição, THE `PostService` SHALL criar o post com `status="scheduled"` e `scheduledAt` definido com o valor fornecido
6. IF `scheduledAt` não é fornecido, é nulo, ou representa uma data no passado, THEN THE `PostService` SHALL criar o post com `status="draft"` e `scheduledAt` nulo
7. THE `PostRepository` SHALL persistir o campo `format` ao criar posts; quando `format` não for fornecido, o valor padrão `"post"` definido no schema Prisma SHALL ser usado
8. WHEN `GET /api/posts` recebe o query param `format=reel`, THE `PostsAPI` SHALL retornar apenas posts com `format="reel"` da empresa autenticada, com os parâmetros de paginação `page` e `pageSize` ainda aplicados ao conjunto filtrado
9. IF `format` é fornecido em `listByCompanyId`, THEN THE `PostService` SHALL adicionar `where: { format }` à query Prisma; se `format` não for fornecido, THE `PostService` SHALL retornar posts de todos os formatos
10. THE `PostService` SHALL retornar `total` correspondente ao total de posts que satisfazem o filtro de `format` aplicado, sem considerar paginação
11. IF `platform` recebido não for um dos valores `"instagram"`, `"facebook"`, `"linkedin"`, `"whatsapp"`, `"tiktok"` ou `"youtube"`, THEN THE `PostService` SHALL rejeitar completamente a criação do post e retornar erro de validação indicando o valor inválido, sem criar o post
12. IF `scheduledAt` for fornecido mas não for uma string ISO 8601 válida, THEN THE `PostService` SHALL rejeitar a criação e retornar erro de validação indicando formato inválido de data; IF `scheduledAt` não for fornecido, THEN THE `PostService` SHALL rejeitar a criação com erro de validação indicando campo obrigatório ausente

---

### Requirement 8: Galeria de Reels na Página `/video`

**User Story:** Como criador de conteúdo, quero visualizar todos os meus reels em uma aba dedicada na página `/video`, para que eu possa gerenciar meu conteúdo de vídeo separadamente dos vídeos gerados por IA.

#### Critérios de Aceitação

1. THE página `/video` SHALL exibir um sistema de duas abas: "Vídeos com IA" (renderiza `VideoGalleryGrid`) e "Reels Agendados" (renderiza `ReelGallerySection`), com a aba "Vídeos com IA" ativa por padrão
2. WHEN um usuário clica na aba "Reels Agendados", THE `ReelGallerySection` SHALL disparar `GET /api/posts?format=reel` e exibir os resultados em grid de cards
3. WHILE `ReelGallerySection` está carregando dados, THE sistema SHALL exibir skeleton loaders nos cards para indicar estado de carregamento
4. THE `ReelGallerySection` SHALL exibir em cada card: plataforma, trecho da legenda (até 100 caracteres), badge de status, data de agendamento ou publicação, e thumbnail do vídeo quando disponível ou ícone de vídeo como placeholder
5. WHEN não há reels cadastrados, THE `ReelGallerySection` SHALL exibir estado vazio com mensagem descritiva e botão CTA redirecionando para `/video/new`
6. THE `ReelGallerySection` SHALL implementar paginação com exatamente 12 itens por página, exibindo controles de navegação quando o total exceder 12 itens
7. THE página `/video` SHALL buscar VideoJobs e posts de reel em paralelo usando `Promise.all`, de modo que o tempo de carregamento da página não seja a soma dos dois tempos individuais
8. WHEN um usuário clica em "Excluir" em um card de reel, THE `ReelGallerySection` SHALL exibir confirmação antes de chamar `DELETE /api/posts?id=...`; WHEN a exclusão retorna sucesso, THE `ReelGallerySection` SHALL remover o card da listagem sem recarregar a página
9. IF a exclusão de um reel retornar erro, THEN THE `ReelGallerySection` SHALL restaurar o card removido otimisticamente e exibir mensagem de erro inline no card
10. WHEN um usuário clica em "Publicar agora" em um card com status `draft` ou `scheduled`, THE `ReelGallerySection` SHALL chamar `POST /api/social/publish` com o `postId` do reel e atualizar o badge de status do card para `published` em caso de sucesso; IF o card não estiver com status `draft` ou `scheduled`, THE `ReelGallerySection` SHALL ignorar o clique em "Publicar agora" sem realizar nenhuma chamada à API

---

### Requirement 9: Geração de Legenda Multi-Plataforma

**User Story:** Como criador de conteúdo, quero gerar legendas otimizadas para TikTok e YouTube Shorts além do Instagram, para que cada plataforma receba conteúdo adequado ao seu formato e audiência.

#### Critérios de Aceitação

1. THE `CaptionAPI` SHALL aceitar o campo `platform` com exatamente os valores `"instagram"`, `"tiktok"` ou `"youtube"`; IF `platform` for `"youtube"` mas falhar na validação de plataforma, THEN THE `CaptionAPI` SHALL rejeitar a requisição e retornar erro de validação sem chamar a IA
2. IF `platform` não for um dos valores `"instagram"`, `"tiktok"` ou `"youtube"`, THEN THE `CaptionAPI` SHALL retornar erro de validação sem chamar a IA, incluindo mensagem de erro indicando o valor inválido recebido e a lista de valores aceitos
3. WHEN `platform` é `"instagram"`, THE `CaptionAPI` SHALL gerar legenda otimizada para Instagram Reels usando o label `"Instagram Reels"` no prompt do sistema e retornar `caption` com no máximo 2200 caracteres
4. WHEN `platform` é `"tiktok"`, THE `CaptionAPI` SHALL gerar legenda otimizada para TikTok usando o label `"TikTok"` no prompt do sistema e retornar `caption` com no máximo 2200 caracteres
5. WHEN `platform` é `"youtube"`, THE `CaptionAPI` SHALL gerar legenda otimizada para YouTube Shorts usando o label `"YouTube Shorts"` no prompt do sistema e retornar `caption` com no máximo 500 caracteres
6. THE `CaptionAPI` SHALL retornar `{ caption: string, hashtags: string[] }` onde `caption` contém ao menos 1 caractere e `hashtags` contém entre 1 e 30 elementos, cada um iniciando com o prefixo `"#"`
7. IF o serviço de IA retornar falha ou não responder dentro de 30 segundos, THEN THE `CaptionAPI` SHALL retornar erro indicando falha na geração sem retornar `caption` ou `hashtags` parciais

---

### Requirement 10: Tratamento de Erros e Resiliência

**User Story:** Como criador de conteúdo, quero receber mensagens de erro claras e poder tentar novamente sem perder meu trabalho, para que falhas pontuais não interrompam meu fluxo de criação.

#### Critérios de Aceitação

1. IF o upload do vídeo falhar com resposta de erro explícita da `UploadAPI`, THEN THE sistema SHALL manter o wizard na etapa de upload sem avançar automaticamente
2. IF a `CaptionAPI` não responder dentro de 30 segundos ou retornar erro, THEN THE sistema SHALL exibir mensagem de erro em destaque vermelho indicando a causa da falha e preservar a URL do vídeo já uploaded no estado do componente
3. IF `POST /api/posts` falhar para uma ou mais plataformas, THEN THE sistema SHALL exibir mensagem de erro listando pelo nome cada plataforma que falhou, manter o formulário aberto para nova tentativa e não duplicar posts já criados com sucesso nas plataformas anteriores
4. WHEN um usuário seleciona TikTok ou YouTube Shorts sem conta social conectada, THE sistema SHALL exibir mensagem de aviso inline próxima ao seletor de plataforma indicando que a publicação requer uma conta conectada, sem bloquear o salvamento — o post é criado com `status="draft"`; IF uma conta TikTok estiver conectada, THE sistema SHALL tentar publicar independentemente das permissões concedidas, sem criar rascunho
5. IF a `UploadAPI` receber um arquivo com tipo MIME diferente de `video/*`, THEN THE `UploadAPI` SHALL retornar erro de validação com status HTTP 400 indicando o tipo inválido, e THE componente de upload SHALL exibir mensagem de erro na zona de upload
6. IF o upload falhar com resposta de erro explícita da `UploadAPI`, THEN THE sistema SHALL exibir mensagem de erro inline na zona de upload com o texto retornado pela API
