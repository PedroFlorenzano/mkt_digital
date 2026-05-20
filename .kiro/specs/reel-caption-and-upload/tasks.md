# Plano de Implementação: Reel Caption & Upload

## Visão Geral

Implementação em TypeScript/Next.js que adiciona dois novos fluxos de criação de reels à plataforma: (1) upload de vídeo com geração de legenda por IA (`ReelCaptionWizard`) e (2) upload de vídeo com legenda manual e publicação (`ReelUploadPublish`). A feature também inclui a extração de `ScheduleAndSave` como componente compartilhado, um novo `VideoPlatformSelector`, a galeria `ReelGallerySection`, o sistema de abas na página `/video`, e as extensões de API necessárias (`/api/posts`, `/api/upload`, `/api/generate/reel-caption`).

---

## Tarefas

- [x] 1. Extrair ScheduleAndSave como componente compartilhado
  - [x] 1.1 Criar `src/client/components/video/ScheduleAndSave.tsx`
    - Extrair a função `ScheduleAndSave` da página `src/app/(dashboard)/create-post/page.tsx` para o arquivo dedicado
    - Manter a mesma interface de props: `scheduledAt`, `setScheduledAt`, `saving`, `saveError`, `platforms`, `onSave`, `onCancel`, `disabled`
    - Exportar o componente como named export
    - _Requirements: 3.9, 4.1_

  - [x]* 1.2 Escrever testes unitários para ScheduleAndSave
    - Testar renderização do botão "Agendar" quando `scheduledAt` está preenchido
    - Testar renderização do botão "Salvar" quando `scheduledAt` está vazio
    - Testar que o botão fica desabilitado quando `saving=true` ou `disabled=true`
    - _Requirements: 3.9, 4.1_

- [x] 2. Criar VideoPlatformSelector
  - [x] 2.1 Criar `src/client/components/video/VideoPlatformSelector.tsx`
    - Definir `VIDEO_PLATFORMS` com `instagram`, `tiktok` e `youtube` com emojis e labels conforme o design
    - Implementar seleção múltipla (1 a 3 plataformas) reutilizando lógica do `PlatformSelector` existente em `create-post/page.tsx`
    - Exibir aviso informativo sobre TikTok quando selecionado (requer app aprovado)
    - Exibir contador "X posts serão criados" quando 2 ou mais plataformas selecionadas
    - Comunicar estado de seleção para o componente pai via `setPlatforms`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x]* 2.2 Escrever property test para contagem do VideoPlatformSelector
    - **Property 8: Contagem de plataformas selecionadas é sempre precisa**
    - **Validates: Requirements 5.4**
    - Para qualquer subconjunto de plataformas selecionadas, verificar que a contagem exibida corresponde ao número exato de plataformas selecionadas

- [x] 3. Implementar a função utilitária `buildFinalCaption`
  - [x] 3.1 Criar `src/client/lib/buildFinalCaption.ts`
    - Implementar `buildFinalCaption(caption: string, hashtags: string[]): string` como função pura
    - Quando `hashtags` não-vazio: retornar `caption + "\n\n" + hashtags.join(" ")`
    - Quando `hashtags` vazio ou nulo: retornar `caption` sem modificações
    - Lançar erro quando o resultado exceder 2200 caracteres (sem truncar o conteúdo)
    - _Requirements: 6.1, 6.2, 6.3_

  - [x]* 3.2 Escrever property tests para `buildFinalCaption`
    - **Property 9: buildFinalCaption com hashtags segue formato especificado**
    - **Validates: Requirements 6.1**
    - Para qualquer `caption` e array não-vazio de `hashtags`, verificar que o resultado é exatamente `caption + "\n\n" + hashtags.join(" ")`
    
    - **Property 10: buildFinalCaption sem hashtags retorna legenda inalterada**
    - **Validates: Requirements 6.2**
    - Para qualquer `caption`, `buildFinalCaption(caption, [])` deve retornar exatamente `caption`
    
    - **Property 11: buildFinalCaption nunca excede 2200 caracteres**
    - **Validates: Requirements 6.3**
    - Para qualquer `caption` com até 2200 caracteres, o resultado de `buildFinalCaption` deve ter comprimento ≤ 2200

- [x] 4. Estender a API `/api/upload` para aceitar vídeos
  - [x] 4.1 Modificar `src/app/api/upload/route.ts`
    - Adicionar tipos MIME de vídeo à lista `ALLOWED_TYPES`: `video/mp4`, `video/mov`, `video/quicktime`, `video/webm`
    - Aumentar `MAX_FILE_SIZE` para 500 MB (500 * 1024 * 1024) para vídeos
    - Implementar validação diferenciada: imagens mantêm limite atual de 10 MB; vídeos aceitam até 500 MB
    - Retornar erro HTTP 400 com mensagem clara quando MIME type não começa com `image/` nem `video/`
    - _Requirements: 2.3, 2.4, 2.5, 10.5_

  - [x]* 4.2 Escrever property test para validação MIME da UploadAPI
    - **Property 21: UploadAPI rejeita arquivos com MIME type não-video**
    - **Validates: Requirements 10.5**
    - Para qualquer arquivo com MIME type que não começa com `video/` nem `image/`, a API deve retornar erro 400

- [x] 5. Estender a API `/api/generate/reel-caption` para múltiplas plataformas
  - [x] 5.1 Modificar `src/app/api/generate/reel-caption/route.ts`
    - Substituir validação `platform !== "instagram"` por `!VALID_VIDEO_PLATFORMS.includes(platform)` onde `VALID_VIDEO_PLATFORMS = ["instagram", "tiktok", "youtube"]`
    - Definir map `platformLabel` com os labels: `instagram` → `"Instagram Reels"`, `tiktok` → `"TikTok"`, `youtube` → `"YouTube Shorts"`
    - Ajustar o `systemPrompt` para usar `platformLabel[platform]` dinamicamente
    - Para `youtube`: limitar o prompt para gerar caption com no máximo 500 caracteres
    - Retornar erro de validação com mensagem incluindo o valor inválido recebido e a lista de valores aceitos
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x]* 5.2 Escrever property test para validação de plataforma da CaptionAPI
    - **Property 19: CaptionAPI aceita apenas plataformas válidas de vídeo**
    - **Validates: Requirements 9.1, 9.2**
    - Para qualquer `platform` fora de `{ "instagram", "tiktok", "youtube" }`, a API deve retornar erro sem chamar a IA
    - Para `platform` dentro do conjunto válido, a API deve aceitar a requisição

- [x] 6. Estender o PostRepository e PostService para suporte a `format` e plataformas extras
  - [x] 6.1 Modificar `src/server/repositories/post.repository.ts`
    - Adicionar `format?: string` à interface `CreatePostData`
    - Passar `format` no `prisma.post.create` (o campo já existe no schema Prisma com default `"post"`)
    - Adicionar `format?: string` ao parâmetro `options` de `findByCompanyId`
    - Quando `format` fornecido, adicionar `where: { companyId, format }` à query Prisma
    - Adicionar `countByCompanyId` com suporte a filtro `format` para refletir total filtrado
    - _Requirements: 7.1, 7.7, 7.8, 7.9, 7.10_

  - [x] 6.2 Modificar `src/server/services/post.service.ts`
    - Expandir `VALID_PLATFORMS` para incluir `"tiktok"` e `"youtube"`
    - Adicionar `format?: string` ao tipo `PostInput`
    - Passar `format` para `postRepository.create` quando fornecido
    - Adicionar validação: quando `format === "reel"` e `imageUrl` é nulo/ausente → lançar `ValidationError`
    - Adicionar validação: quando `format === "reel"` e `content` é nulo/vazio/apenas whitespace → lançar `ValidationError`
    - Adicionar validação: quando `scheduledAt` fornecido mas não ISO 8601 válido → lançar `ValidationError`
    - Adicionar `format?: string` ao parâmetro `options` de `listByCompanyId` e repassar ao repositório
    - Garantir que `total` retornado reflita o filtro `format` aplicado
    - _Requirements: 7.2, 7.3, 7.4, 7.5, 7.6, 7.9, 7.10, 7.11, 7.12_

  - [x]* 6.3 Escrever property tests para PostService
    - **Property 12: PostService aceita todas as plataformas válidas sem erro**
    - **Validates: Requirements 7.2**
    - Para qualquer plataforma de `{ "instagram", "facebook", "linkedin", "whatsapp", "tiktok", "youtube" }`, `createForCompany` deve criar o post sem erro de validação
    
    - **Property 13: Rejeição de reel sem content não-vazio**
    - **Validates: Requirements 7.4**
    - Para qualquer string nula, vazia ou apenas whitespace como `content` com `format="reel"`, o `PostService` deve lançar `ValidationError`
    
    - **Property 14: Status do post é determinístico baseado em scheduledAt**
    - **Validates: Requirements 7.5, 7.6**
    - Para `scheduledAt` ISO 8601 futuro válido → `status="scheduled"`; para `scheduledAt` null/ausente → `status="draft"`
    
    - **Property 15: Round-trip de persistência do campo format**
    - **Validates: Requirements 7.7**
    - Para qualquer `format` de `{ "post", "carousel", "reel", "story" }`, criar e recuperar o post deve preservar o valor exato de `format`
    
    - **Property 16: Filtro format em listByCompanyId retorna apenas posts correspondentes**
    - **Validates: Requirements 7.8, 7.9, 7.10**
    - Para empresa com posts de múltiplos formatos, `listByCompanyId(companyId, { format: "reel" })` deve retornar apenas posts com `format === "reel"` da empresa correta

- [x] 7. Estender a API `/api/posts` (route handler) para format e format filter
  - [x] 7.1 Modificar `src/app/api/posts/route.ts`
    - No handler `GET`: ler `searchParams.get("format")` e passar como opção ao `postService.listByCompanyId`
    - Retornar `{ data, total, page, pageSize, hasNextPage }` ao invés de apenas `result.data` (para suportar paginação na galeria)
    - No handler `POST`: ler `body["format"]` e incluí-lo na chamada ao `postService.createForCompany`
    - _Requirements: 7.1, 7.8_

- [x] 8. Criar componente ReelCaptionWizard
  - [x] 8.1 Criar `src/client/components/video/ReelCaptionWizard.tsx`
    - Implementar wizard de 3 etapas usando estado interno `ReelCaptionState` conforme o design
    - **Etapa 1 (Upload)**: Dropzone reutilizando padrão de `uploadTextOnlyMedia` do create-post; aceitar apenas arquivos `video/*`; validar tamanho ≤ 500 MB client-side antes do upload; exibir mensagem de erro inline na dropzone em caso de falha; avançar automaticamente para Etapa 2 após upload com sucesso
    - **Etapa 2 (Geração)**: Campo de texto para `idea` (máx 500 chars); `VideoPlatformSelector`; botão "Gerar Legenda" desabilitado enquanto vídeo não uploaded; enviar `{ idea, platform: platforms[0] }` para `POST /api/generate/reel-caption`; exibir loading no botão durante chamada; em erro, exibir alerta vermelho e manter vídeo preservado
    - **Etapa 3 (Revisar e Salvar)**: Textarea editável com legenda gerada; hashtags renderizadas como tags visuais (badges); componente `ScheduleAndSave` importado; botão "Salvar" desabilitado enquanto textarea está vazia ou apenas whitespace; ao salvar, chamar `POST /api/posts` com `{ platform, content: buildFinalCaption(caption, hashtags), imageUrl: videoUrl, format: "reel", scheduledAt? }` para cada plataforma via `Promise.all`; redirecionar para `/posts` após sucesso
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 10.1, 10.2_

  - [x]* 8.2 Escrever property tests para ReelCaptionWizard
    - **Property 3: Estado interno preserva dados do upload com sucesso**
    - **Validates: Requirements 2.5**
    - Para qualquer resposta de sucesso da UploadAPI com `{ files: [{ url, name }] }`, o estado interno deve armazenar `url` e `name` exatamente como retornados
    
    - **Property 4: Botão de ação desabilitado sem pré-condições satisfeitas**
    - **Validates: Requirements 3.4, 3.9**
    - Para qualquer estado onde `videoFile === null`, legenda vazia, ou nenhuma plataforma selecionada, o botão principal deve estar desabilitado
    
    - **Property 5: Dados enviados à CaptionAPI correspondem ao input do usuário**
    - **Validates: Requirements 3.5**
    - Para qualquer combinação de `idea` e `platform` válida, os dados enviados devem ser exatamente `{ idea, platform }` sem modificações
    
    - **Property 6: Legenda gerada pela IA é propagada ao estado da textarea**
    - **Validates: Requirements 3.6**
    - Para qualquer resposta bem-sucedida da CaptionAPI com `{ caption, hashtags }`, o texto na textarea deve corresponder à legenda retornada

- [x] 9. Criar componente ReelUploadPublish
  - [x] 9.1 Criar `src/client/components/video/ReelUploadPublish.tsx`
    - Implementar formulário de página única com estado `ReelUploadPublishState` conforme o design
    - Dropzone de vídeo: aceitar apenas `video/*`; validar tamanho ≤ 500 MB client-side; exibir erro inline em falha de upload; mostrar barra de progresso durante upload
    - Textarea para legenda manual: limite de 2200 caracteres; contador de caracteres visível
    - `VideoPlatformSelector` para escolha de plataformas (opcional — sem plataforma salva como rascunho)
    - `ScheduleAndSave` importado
    - Habilitar botão "Salvar" quando: vídeo uploaded E legenda com ≥ 1 caractere não-branco
    - Validação de submit: se botão acionado sem vídeo ou sem legenda, exibir mensagem indicando quais campos estão faltando
    - Ao salvar: chamar `POST /api/posts` para cada plataforma selecionada (ou sem `platform` se nenhuma) em paralelo via `Promise.all`; exibir erros por plataforma se alguma falhar; redirecionar para `/posts` em sucesso
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 10.3_

  - [x]* 9.2 Escrever property tests para ReelUploadPublish
    - **Property 4: Botão de ação desabilitado sem pré-condições satisfeitas**
    - **Validates: Requirements 4.2**
    - Para qualquer estado onde `videoFile === null` ou `caption.trim() === ""`, o botão de salvar deve estar desabilitado
    
    - **Property 7: Número de chamadas à API corresponde ao número de plataformas**
    - **Validates: Requirements 4.5**
    - Para N plataformas selecionadas (N ≥ 1), ao submeter o formulário o sistema deve realizar exatamente N chamadas ao `POST /api/posts`

- [x] 10. Checkpoint — Testar os componentes base e APIs
  - Garantir que `buildFinalCaption`, `VideoPlatformSelector`, `ScheduleAndSave`, `ReelCaptionWizard` e `ReelUploadPublish` passam nos testes
  - Verificar que `POST /api/posts` aceita `format="reel"` e `POST /api/generate/reel-caption` aceita `tiktok` e `youtube`
  - Verificar que `POST /api/upload` aceita arquivos de vídeo
  - Pedir ao usuário se há dúvidas antes de prosseguir

- [x] 11. Criar ModeSelector e refatorar a página `/video/new`
  - [x] 11.1 Modificar `src/app/(dashboard)/video/new/page.tsx`
    - Converter para componente client (`"use client"`) pois o seletor de modo é interativo
    - Adicionar estado `activeMode: VideoCreationMode` com default `"ai-pipeline"`
    - Renderizar três cards de seleção de modo: azul (IA Avançada + `VideoWizard`), roxo (Upload + Legenda IA + `ReelCaptionWizard`), verde (Upload + Publicar + `ReelUploadPublish`)
    - Ao trocar de modo, resetar o estado interno do novo componente para estado inicial (cada componente é remontado via `key={activeMode}`)
    - Manter `VideoWizard` existente ativo por padrão
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

  - [x]* 11.2 Escrever property test para ModeSelector
    - **Property 1: Seleção de modo renderiza componente correspondente**
    - **Validates: Requirements 1.2, 1.3, 1.4**
    - Para cada `VideoCreationMode` válido, verificar que o componente renderizado corresponde ao mapeamento: `ai-pipeline` → `VideoWizard`, `upload-caption` → `ReelCaptionWizard`, `upload-publish` → `ReelUploadPublish`

- [x] 12. Criar ReelGallerySection
  - [x] 12.1 Criar `src/client/components/video/ReelGallerySection.tsx`
    - Buscar `GET /api/posts?format=reel&page={page}&pageSize=12` internamente no componente
    - Exibir skeleton loaders durante carregamento (grade de 12 placeholders)
    - Renderizar grid de cards, cada um exibindo: plataforma (badge), trecho da legenda (até 100 chars), badge de status (`draft`/`scheduled`/`published`), data de agendamento ou publicação, thumbnail de vídeo (tag `<video>` ou `poster`) ou ícone placeholder
    - Estado vazio: mensagem descritiva + botão CTA `Link href="/video/new"`
    - Paginação com controles quando `total > 12`
    - Ação "Publicar agora" (para `draft` e `scheduled`): chamar `POST /api/social/publish` com `postId`; atualizar badge de status do card para `published` em sucesso; exibir erro inline no card em falha
    - Ação "Excluir": exibir confirmação antes de chamar `DELETE /api/posts?id=...`; remover card otimisticamente em sucesso; restaurar card e exibir erro inline em falha
    - _Requirements: 8.2, 8.3, 8.4, 8.5, 8.6, 8.8, 8.9, 8.10_

  - [x]* 12.2 Escrever property tests para ReelGallerySection
    - **Property 17: Card de reel exibe todos os campos obrigatórios**
    - **Validates: Requirements 8.3**
    - Para qualquer `ReelPost` válido, o card renderizado deve conter representação visual de plataforma, trecho da legenda, status e data
    
    - **Property 18: Paginação limita exibição a 12 itens por página**
    - **Validates: Requirements 8.5**
    - Para qualquer lista de reels com mais de 12 itens, cada página deve conter no máximo 12 cards

- [x] 13. Estender a página `/video` com sistema de abas
  - [x] 13.1 Modificar `src/app/(dashboard)/video/page.tsx`
    - Converter para componente client (`"use client"`) para gerenciar estado da aba ativa
    - Adicionar estado `activeTab: VideoTab` com default `"ai-jobs"`
    - Renderizar abas: "Vídeos com IA" → `VideoGalleryGrid` existente; "Reels Agendados" → `ReelGallerySection` novo
    - Usar `Promise.all` para buscar VideoJobs e posts de reel em paralelo na carga inicial da página (ou usar `Suspense` independente por aba)
    - Exibir badges de contagem em cada aba quando disponível
    - _Requirements: 8.1, 8.7_

- [x] 14. Validação de upload de vídeo no lado client (barra de progresso)
  - [x] 14.1 Criar `src/client/components/video/VideoUploadDropzone.tsx`
    - Componente de dropzone especializado para vídeo (derivado do padrão de `UploadDropzone.tsx` existente)
    - Validação client-side antes do upload: MIME type deve começar com `video/`; tamanho ≤ 500 MB
    - Exibir mensagem com formatos aceitos (MP4, MOV, WebM) e limite (500 MB)
    - Exibir barra de progresso de 0% a 100% usando `XMLHttpRequest` (que suporta `onprogress`) ao invés de `fetch`
    - Desabilitar interações durante upload em andamento
    - Em erro da UploadAPI, exibir mensagem retornada pela API na zona de upload
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

  - [x]* 14.2 Escrever property test para validação de arquivo do VideoUploadDropzone
    - **Property 2: Validação de tamanho de arquivo rejeita acima do limite**
    - **Validates: Requirements 2.3**
    - Para qualquer arquivo com tamanho > 500 MB, o sistema deve rejeitar sem iniciar o upload e exibir mensagem com o limite

- [x] 15. Instalar fast-check e configurar infraestrutura de property tests
  - [x] 15.1 Instalar e configurar `fast-check`
    - Executar `npm install --save-dev fast-check` (pinado na versão estável atual)
    - Verificar que `jest.config.ts` já está configurado para TypeScript (já usa `ts-jest`)
    - Criar arquivo `src/server/__tests__/lib/buildFinalCaption.pbt.test.ts` como primeiro teste de propriedade para validar o setup
    - _Requirements: 6.1, 6.2, 6.3_

- [x] 16. Atualizar ReelCaptionWizard e ReelUploadPublish para usar VideoUploadDropzone
  - [x] 16.1 Substituir dropzone inline pelo componente `VideoUploadDropzone` nos wizards
    - Atualizar `ReelCaptionWizard.tsx` para usar `VideoUploadDropzone` no lugar da lógica de upload inline
    - Atualizar `ReelUploadPublish.tsx` para usar `VideoUploadDropzone` no lugar da lógica de upload inline
    - Garantir que o estado de `videoFile` é atualizado via callback `onUploaded`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

- [x] 17. Tratamento de erros de falha parcial ao salvar múltiplas plataformas
  - [x] 17.1 Implementar lógica de erro granular por plataforma em ReelUploadPublish e ReelCaptionWizard
    - Substituir `Promise.all` simples por lógica que captura resultados individuais (`Promise.allSettled`)
    - Exibir lista de plataformas que falharam com o respectivo erro
    - Manter formulário aberto para nova tentativa
    - Garantir que as plataformas que falharam não duplicam posts já criados (não recriar plataformas com sucesso)
    - _Requirements: 10.3_

  - [x]* 17.2 Escrever property test para falha parcial
    - **Property 20: Falha parcial ao salvar não duplica posts já criados**
    - **Validates: Requirements 10.3**
    - Para N plataformas onde K criaram com sucesso antes de uma falha, nova tentativa não deve duplicar os K posts já existentes

- [x] 18. Avisos para plataformas não conectadas
  - [x] 18.1 Adicionar verificação de contas sociais conectadas no VideoPlatformSelector
    - Ao selecionar TikTok ou YouTube, verificar se a conta social está conectada (via estado/contexto existente)
    - Exibir mensagem de aviso inline próxima ao seletor indicando que publicação requer conta conectada
    - Não bloquear o salvamento — post é criado com `status="draft"` mesmo sem conta conectada
    - _Requirements: 10.4_

- [x] 19. Checkpoint final — Garantir todos os testes passam
  - Rodar `npm test` e garantir que todos os testes unitários e de propriedade passam
  - Verificar que `npm run type-check` e `npm run lint` não retornam erros
  - Verificar que os três modos da página `/video/new` funcionam conforme esperado
  - Verificar que a aba "Reels Agendados" na página `/video` exibe os posts criados
  - Pedir ao usuário se há dúvidas antes de encerrar

---

## Notas

- Tarefas marcadas com `*` são opcionais e podem ser puladas para um MVP mais rápido
- O campo `format` já existe no schema Prisma (`String? @default("post")`) — nenhuma migração necessária
- O `fast-check` precisa ser instalado (não está no `package.json` atual)
- `XMLHttpRequest` é necessário na `VideoUploadDropzone` para suporte a barra de progresso (`fetch` não expõe `onprogress`)
- Cada tarefa referencia os requisitos específicos para rastreabilidade
- Checkpoints garantem validação incremental
- Property tests validam propriedades universais de correção
- Testes unitários validam exemplos específicos e casos de borda

---

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "3.1", "6.1"] },
    { "id": 1, "tasks": ["1.2", "3.2", "6.2", "15.1"] },
    { "id": 2, "tasks": ["2.1", "4.1", "5.1", "6.3", "7.1"] },
    { "id": 3, "tasks": ["2.2", "4.2", "5.2", "14.1"] },
    { "id": 4, "tasks": ["8.1", "9.1", "14.2"] },
    { "id": 5, "tasks": ["8.2", "9.2", "16.1"] },
    { "id": 6, "tasks": ["11.1", "12.1", "17.1"] },
    { "id": 7, "tasks": ["11.2", "12.2", "17.2", "18.1"] },
    { "id": 8, "tasks": ["13.1"] }
  ]
}
```
