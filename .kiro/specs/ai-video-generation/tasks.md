# Plano de Implementação — Geração de Vídeos Curtos com IA

## Visão Geral

Implementação incremental do módulo de geração de vídeos curtos com IA, partindo da fundação de dados e utilitários sem chamadas AWS, evoluindo pelo pipeline de backend (ffmpeg + Bedrock + Polly), pelas API routes, pela interface frontend e, por fim, pelos testes e trilhas sonoras.

Antes de iniciar a implementação, instale as dependências necessárias:

```bash
npm install fluent-ffmpeg @ffmpeg-installer/ffmpeg @aws-sdk/client-polly @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
npm install --save-dev @types/fluent-ffmpeg
```

---

## Tarefas

- [ ] 1. Fundação — Schema, variáveis de ambiente e utilitários puros
  - [ ] 1.1 Adicionar modelos `VideoJob` e `VideoCredit` ao schema Prisma
    - Adicionar os dois modelos ao arquivo `prisma/schema.prisma` exatamente conforme especificado no design (campos, índices, relações `onDelete: Cascade`)
    - Adicionar as relações `videoJobs VideoJob[]` e `videoCredits VideoCredit[]` ao modelo `Company` existente
    - Executar `npx prisma migrate dev --name add-video-module` para aplicar a migração
    - _Requisitos: 8.6, 12.1, 12.2_

  - [ ] 1.2 Configurar variáveis de ambiente do módulo de vídeo
    - Adicionar `AWS_S3_VIDEO_BUCKET`, `AWS_POLLY_REGION` e `CRON_SECRET` ao arquivo `.env.example` com valores placeholder
    - Criar `src/server/lib/video-env.ts` que valida a presença dessas variáveis no startup e lança erro descritivo se ausentes
    - _Requisitos: 2.6, 7.1, 12.1_

  - [ ] 1.3 Implementar `src/server/lib/frame-selector.ts`
    - Implementar `histogramDiff(a: number[], b: number[]): number` — soma das diferenças absolutas bin a bin
    - Implementar `selectRepresentativeFrames(frames: FrameHistogram[], maxFrames: number): FrameHistogram[]` — garante que o primeiro e o último frame sempre estejam incluídos; ordena os demais por maior variação cumulativa em relação ao frame anterior
    - Exportar as interfaces `FrameHistogram`
    - _Requisitos: 4.6_

  - [ ]* 1.4 Escrever testes de propriedade para `frame-selector.ts`
    - **Property 8: Seleção de frames representativos é subconjunto de cardinalidade limitada**
    - **Valida: Requisito 4.6**
    - Usar fast-check para gerar listas de `FrameHistogram` com comprimento `n >= 1` e `maxFrames` aleatório
    - Verificar que `result.length <= maxFrames`, que todo elemento de `result` pertence à entrada e que `result.length <= n`

  - [ ] 1.5 Implementar funções de validação pura em `src/server/lib/video-validations.ts`
    - `requireVideoAccess(planName: string): boolean` — retorna `true` somente para `"Profissional"` e `"Agencia"` (exato, case-sensitive)
    - `canGenerateVideo(creditBalance: number): boolean` — retorna `true` somente quando `creditBalance > 0`
    - `isValidVideoFormat(mimeType: string): boolean` — aceita apenas `"video/mp4"`, `"video/quicktime"`, `"video/webm"`
    - `isValidVideoFile(fileSizeBytes: number, durationSeconds: number): boolean` — valida `size <= 524_288_000` e `3 <= duration <= 600`
    - `isValidContextDescription(s: string): boolean` — valida `10 <= s.length <= 500`
    - `getAspectRatio(platform: VideoPlatform): "9:16" | "16:9"` — `"9:16"` para `instagram_reels` e `tiktok`; `"16:9"` para `youtube_shorts`
    - `calculateExtractionParams(durationSeconds: number): { interval: number; maxFrames: number }` — `interval = 1` se `<= 60s`, `interval = 2` caso contrário; `maxFrames = 60`
    - `isScriptDurationValid(script: string[], targetSeconds: number): boolean` — `totalWords / 120 * 60`; tolerância ±5s
    - _Requisitos: 1.1, 1.2, 1.5, 2.1, 2.2, 2.3, 2.4, 2.9, 3.3, 4.2, 5.3_

  - [ ]* 1.6 Escrever testes de propriedade para as funções de validação pura
    - **Property 1: Controle de acesso por plano é bicondicional** — Valida: Requisitos 1.1, 1.2
    - **Property 2: Verificação de créditos é monotônica** — Valida: Requisitos 1.5, 3.4
    - **Property 3: Validação de formato de arquivo é exaustiva** — Valida: Requisito 2.1
    - **Property 4: Validação de tamanho e duração formam intervalo fechado** — Valida: Requisitos 2.2, 2.3, 2.4
    - **Property 5: Validação de descrição respeita limites de comprimento** — Valida: Requisito 2.9
    - **Property 6: Mapeamento de plataforma para proporção é total e determinístico** — Valida: Requisito 3.3
    - **Property 7: Parâmetros de extração respeitam intervalo e contagem máxima** — Valida: Requisito 4.2
    - **Property 9: Validação de duração do script respeita tolerância de ±5s** — Valida: Requisito 5.3

- [ ] 2. Libs de infraestrutura AWS
  - [ ] 2.1 Implementar `src/server/lib/s3-video.ts`
    - Implementar `uploadVideoArtifact(s3Key, body, contentType): Promise<void>`
    - Implementar `downloadVideoArtifact(s3Key): Promise<Buffer>`
    - Implementar `generatePresignedUploadUrl(s3Key, contentType, expiresIn): Promise<string>`
    - Implementar `generatePresignedDownloadUrl(s3Key, expiresIn): Promise<string>`
    - Implementar `deleteVideoArtifacts(s3Keys: string[]): Promise<void>`
    - Implementar `buildJobS3Prefix(jobId: string): string` — retorna `videos/${jobId}/`
    - Usar `@aws-sdk/client-s3` e `@aws-sdk/s3-request-presigner`; bucket via `process.env.AWS_S3_VIDEO_BUCKET`
    - _Requisitos: 2.6, 2.7, 10.2, 10.7, 11.5_

  - [ ] 2.2 Implementar `src/server/lib/aws-polly.ts`
    - Definir a interface `PollyConfig { voice, text, outputFormat: 'mp3', sampleRate: '22050' }`
    - Implementar `synthesizeSpeech(config: PollyConfig): Promise<Buffer>` usando `@aws-sdk/client-polly`
    - Região via `process.env.AWS_POLLY_REGION` (default `"us-east-1"`)
    - Lançar `ExternalServiceError` em caso de falha no serviço Polly
    - _Requisitos: 7.1, 7.3_

- [ ] 3. Serialização e validação do artefato de pipeline
  - [ ] 3.1 Implementar `src/server/lib/video-brief.ts`
    - Exportar as interfaces TypeScript: `VideoPipelineBrief`, `OverlayText`, `FramePrompt`
    - Implementar `serializeBrief(brief: VideoPipelineBrief): string` — serialização JSON canônica
    - Implementar `deserializeBrief(json: string): VideoPipelineBrief` — parse + validação de schema
    - Implementar `validateBrief(obj: unknown): obj is VideoPipelineBrief` — verifica presença e tipos de todos os campos obrigatórios
    - Implementar `validateOverlayTimestamps(overlayTexts: OverlayText[]): boolean` — rejeita timestamps negativos ou fora de ordem crescente
    - _Requisitos: 13.1, 13.2, 13.3, 13.4, 13.5_

  - [ ]* 3.2 Escrever testes de propriedade para serialização de `VideoPipelineBrief`
    - **Property 10: Serialização é round-trip preservador de equivalência** — Valida: Requisitos 13.1, 13.4
    - **Property 11: Timestamps de overlayTexts são não-negativos e monotonicamente crescentes** — Valida: Requisito 13.5
    - Usar fast-check para gerar `VideoPipelineBrief` arbitrários válidos e verificar `deepEqual(deserializeBrief(serializeBrief(brief)), brief) === true`
    - Verificar que `validateOverlayTimestamps` rejeita listas com timestamps negativos ou fora de ordem

- [ ] 4. Checkpoint — Testes de fundação
  - Garantir que todos os testes de propriedade e unitários das tarefas 1 e 3 passam. Executar `npx jest --testPathPattern="frame-selector|video-validations|video-brief"`. Resolver quaisquer falhas antes de prosseguir.

- [ ] 5. Pipeline de backend — Serviços de processamento
  - [ ] 5.1 Implementar `src/server/services/frame-extractor.service.ts`
    - Instalar ffmpeg via `@ffmpeg-installer/ffmpeg` e configurar o path no módulo
    - Implementar `extractFrames(jobId, rawS3Key, durationSeconds): Promise<FrameExtractionResult>`:
      1. Baixa o vídeo bruto do S3 para diretório temporário via `downloadVideoArtifact`
      2. Calcula o intervalo de extração usando `calculateExtractionParams`
      3. Executa extração via `fluent-ffmpeg` (frames JPEG, qualidade 90, máximo 60 frames)
      4. Faz upload de cada frame para `videos/{jobId}/frames/frame_{index}.jpg` via `uploadVideoArtifact`
      5. Delega a `selectRepresentativeFrames` para selecionar até 10 frames representativos
      6. Remove todos os arquivos temporários locais
      7. Em caso de falha de leitura pelo ffmpeg, lança erro com mensagem `"vídeo inválido ou corrompido"`
    - _Requisitos: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [ ] 5.2 Implementar `src/server/services/frame-transformer.service.ts`
    - Implementar `transformFrames(jobId, frames, prompts, style): Promise<FrameTransformResult[]>`:
      1. Processa cada frame em sequência via Stable Diffusion Ultra (AWS Bedrock), modo image-to-image com `strength: 0.65`
      2. Armazena cada frame transformado em `videos/{jobId}/transformed/frame_{index}.jpg` (JPEG, qualidade 95)
      3. Em caso de falha após 2 tentativas, utiliza o frame original como fallback e define `usedFallback: true`
      4. Registra custo de cada chamada no `CostLog` com `type: "video_transform"`
      5. Limita a 30 frames transformados por job
    - _Requisitos: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [ ] 5.3 Implementar `src/server/services/narration.service.ts`
    - Implementar `generateNarration(jobId, script, voice): Promise<NarrationResult>`:
      1. Concatena o array de sentenças do script em texto corrido
      2. Chama `synthesizeSpeech` de `aws-polly.ts` com a voz selecionada e formato MP3 22050 Hz
      3. Armazena o arquivo MP3 em `videos/{jobId}/narration/audio.mp3` via `uploadVideoArtifact`
      4. Registra custo (número de caracteres) no `CostLog` com `type: "video_narration"`
      5. Em caso de falha no upload S3 após Polly retornar sucesso, não atualiza status e registra falha para retry
    - _Requisitos: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [ ] 5.4 Implementar `src/server/services/video-assembler.service.ts`
    - Implementar `assembleVideo(jobId, config): Promise<VideoGenerationResult>`:
      1. Baixa todos os frames transformados e o arquivo de narração MP3 do S3
      2. Seleciona a trilha sonora de `public/audio/music/` com base no campo `musicCategory` do brief
      3. Executa montagem com `fluent-ffmpeg`: codec `libx264`, áudio `aac`, bitrate `4000k`, resolução conforme plataforma (1080x1920 ou 1920x1080)
      4. Mistura a trilha sonora com volume 20% da narração usando filtro `amix`
      5. Renderiza os `overlayTexts` via `drawtext` do ffmpeg: fonte Arial, 28pt, branco com sombra preta 2px, no timestamp configurado
      6. Verifica se a duração do vídeo final está dentro do alvo ±5s; se não estiver, ajusta a velocidade de exibição dos frames com `setpts` e re-renderiza
      7. Faz upload do `final.mp4` para `videos/{jobId}/output/final.mp4`
      8. Remove todos os arquivos temporários locais
    - _Requisitos: 8.1, 8.2, 8.3, 8.4, 8.5, 8.8_

  - [ ] 5.5 Implementar `src/server/services/video-job.service.ts` — orquestrador do pipeline
    - Definir e exportar todos os tipos TypeScript do módulo: `VideoJobStatus`, `VideoPlatform`, `VideoVisualStyle`, `PollyVoice`, `VideoJobConfig`, `VideoJobStatusResponse` etc.
    - Implementar `createJob(config: VideoJobConfig): Promise<VideoJob>` — valida créditos, cria o registro com `status: "queued"`, aciona worker via fire-and-forget
    - Implementar `runPipeline(jobId: string): Promise<void>` — executa cada etapa em sequência, atualizando `status` e `progress` conforme a tabela do design após cada etapa; limita custo a USD 2,00 (requisito 12.4)
    - Implementar `getJobStatus(jobId, companyId): Promise<VideoJobStatusResponse>` — leitura de status para polling
    - Implementar `listJobs(companyId, options): Promise<{ jobs, pagination }>` — paginação de 12 itens, filtros por status e período
    - Implementar `deleteJob(jobId, companyId): Promise<void>` — remove job do banco e todos os artefatos S3 via `deleteVideoArtifacts`
    - Implementar `deductCredit(companyId, jobId): Promise<void>` — deduz 1 crédito do `VideoCredit` do período corrente atomicamente
    - Implementar `estimateRemainingTime(jobId): Promise<number>` — média das últimas 10 gerações concluídas da plataforma
    - _Requisitos: 1.4, 1.5, 3.4, 3.5, 8.5, 8.6, 8.7, 9.6, 11.1, 11.5, 12.4_

- [ ] 6. Checkpoint — Integração dos serviços de backend
  - Garantir que todos os serviços compilam sem erro TypeScript. Executar `npx tsc --noEmit`. Resolver todos os erros de tipo antes de prosseguir com as API routes.

- [ ] 7. API Routes
  - [ ] 7.1 Implementar `POST /api/video/upload` em `src/app/api/video/upload/route.ts`
    - Autenticar o usuário via `getServerSession`; retornar `401` se não autenticado
    - Verificar plano da empresa (`requireVideoAccess`); retornar `403` se inelegível
    - Validar body: `fileName`, `fileSize`, `mimeType` — rejeitar com `400` se `isValidVideoFormat` ou `isValidVideoFile` (tamanho) falhar
    - Gerar chave S3 isolada por empresa: `videos/raw/company_{companyId}/{uuid}.{ext}`
    - Chamar `generatePresignedUploadUrl` e retornar `{ uploadUrl, s3Key, expiresIn: 3600 }`
    - _Requisitos: 2.1, 2.2, 2.6_

  - [ ] 7.2 Implementar `POST /api/video/jobs` em `src/app/api/video/jobs/route.ts`
    - Autenticar; verificar plano (`requireVideoAccess`); verificar créditos (`canGenerateVideo`); retornar `403` se inelegível
    - Validar body completo (platform, targetDuration, visualStyle, narratorVoice, contextDescription) via `isValidContextDescription`; retornar `400` em validação falha
    - Chamar `createJob(config)` e retornar `201` com `{ jobId, status: "queued", creditsRemaining }`
    - _Requisitos: 3.4, 3.5_

  - [ ] 7.3 Implementar `GET /api/video/jobs` e `GET /api/video/jobs/[id]`
    - `GET /api/video/jobs`: listagem paginada com query params `page`, `pageSize`, `status`, `from`, `to`; retornar `{ jobs, pagination }`
    - `GET /api/video/jobs/[id]`: retornar `VideoJobStatusResponse` para polling; retornar `403` se job não pertence à empresa autenticada; retornar `404` se não encontrado
    - _Requisitos: 9.1, 9.2, 9.3, 9.6, 11.1, 11.2, 11.3_

  - [ ] 7.4 Implementar `GET /api/video/jobs/[id]/download` em `src/app/api/video/jobs/[id]/download/route.ts`
    - Autenticar; verificar ownership do job; verificar que `status === "completed"` e `outputS3Key` não é nulo; retornar `404` caso contrário
    - Chamar `generatePresignedDownloadUrl(outputS3Key, 86400)` (24h)
    - Retornar `{ downloadUrl, fileName, expiresAt }`
    - _Requisitos: 10.2, 10.3, 10.7_

  - [ ] 7.5 Implementar `DELETE /api/video/jobs/[id]` em `src/app/api/video/jobs/[id]/route.ts`
    - Autenticar; verificar ownership; chamar `deleteJob(jobId, companyId)`
    - Retornar `204` sem corpo em caso de sucesso
    - _Requisitos: 11.5_

  - [ ] 7.6 Implementar `GET /api/cron/video-worker` em `src/app/api/cron/video-worker/route.ts`
    - Verificar header `Authorization: Bearer {CRON_SECRET}`; retornar `401` se inválido
    - Buscar o próximo job com `status = "queued"` (ordenado por `createdAt ASC`)
    - Se não houver job, retornar `{ processed: false }`
    - Chamar `runPipeline(jobId)` e retornar `{ processed: true, jobId, finalStatus }`
    - _Requisitos: 3.5, 4.1, 5.1, 6.1, 7.1, 8.1_

- [ ] 8. Checkpoint — Smoke test das API routes
  - Garantir que o projeto Next.js compila sem erros com `next build` ou `npx tsc --noEmit`. Verificar que todas as rotas estão corretamente registradas.

- [ ] 9. Frontend — Sidebar e galeria de vídeos
  - [ ] 9.1 Adicionar link "Vídeos" à sidebar
    - Editar `src/client/components/layout/sidebar.tsx` para adicionar `{ href: "/video", label: "Vídeos", icon: Video }` ao array `navItems`
    - Importar o ícone `Video` do `lucide-react`
    - _Requisitos: 11.1_

  - [ ] 9.2 Criar componentes de galeria em `src/client/components/video/`
    - `VideoCard.tsx` — exibe thumbnail do primeiro frame transformado, status com badge colorido, data de geração, duração configurada, rede social de destino e créditos consumidos; ao clicar em job concluído, navega para `/video/[id]`
    - `VideoGalleryGrid.tsx` — grid responsivo de `VideoCard`, com paginação de 12 itens
    - `CreditBadge.tsx` — exibe saldo restante de créditos do mês e data de renovação; aparência diferente quando saldo = 0
    - `NewVideoButton.tsx` — botão que navega para `/video/new`; desabilitado quando saldo = 0
    - _Requisitos: 11.1, 11.2, 11.3, 1.5_

  - [ ] 9.3 Criar página galeria `src/app/(dashboard)/video/page.tsx`
    - Carregar dados iniciais via Server Component (jobs paginados + saldo de créditos)
    - Renderizar `DashboardLayout` > `CreditBadge` + `NewVideoButton` + `VideoGalleryGrid`
    - Implementar filtros por status e período via query params
    - Tratar caso de plano inelegível: exibir tela de bloqueio com descrição do recurso e botão de upgrade
    - _Requisitos: 1.1, 1.2, 1.3, 11.1, 11.2, 11.3_

- [ ] 10. Frontend — Wizard de criação de vídeo
  - [ ] 10.1 Criar componentes do Step 1 em `src/client/components/video/`
    - `UploadDropzone.tsx` — drag-and-drop com validação de formato (`isValidVideoFormat`) e tamanho (500 MB); barra de progresso de upload com percentual; preview do primeiro frame após upload bem-sucedido; trata falha de conexão exibindo botão "Tentar novamente"
    - `VideoContextForm.tsx` — campo de texto com contador de caracteres (10-500); bloqueio de prosseguimento se fora do intervalo
    - `Step1Upload.tsx` — combina `UploadDropzone` + `VideoContextForm`; ao concluir, chama `POST /api/video/upload` para obter URL pré-assinada e faz PUT direto ao S3
    - _Requisitos: 2.1, 2.2, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9_

  - [ ] 10.2 Criar componentes do Step 2 em `src/client/components/video/`
    - `PlatformSelector.tsx` — seleção visual de Instagram Reels, TikTok, YouTube Shorts com exibição da proporção de aspecto resultante
    - `DurationSelector.tsx` — seleção de 15s, 30s ou 60s
    - `StyleSelector.tsx` — seleção de estilo: realista, cinematográfico, minimalista
    - `CTAInput.tsx` — campo de texto para chamada para ação (opcional)
    - `VoiceSelector.tsx` — seleção de voz Camila (feminina) ou Ricardo (masculino)
    - `Step2Config.tsx` — combina todos os seletores; pré-preenche o tom com o tom cadastrado da empresa
    - _Requisitos: 3.1, 3.2, 3.3_

  - [ ] 10.3 Criar Step 3 e o wizard completo
    - `Step3Review.tsx` — exibe resumo de todas as configurações (plataforma, duração, estilo, voz, CTA, descrição de contexto); exibe saldo de créditos e aviso se saldo = 0; botão "Confirmar e Gerar" que chama `POST /api/video/jobs` e navega para `/video/[id]`
    - `VideoWizard.tsx` — gerencia o estado multi-etapa (step 1, 2, 3) com indicador de progresso; bloqueia navegação para step seguinte enquanto validações não passam
    - `src/app/(dashboard)/video/new/page.tsx` — renderiza `DashboardLayout` > `VideoWizard`
    - _Requisitos: 1.3, 1.5, 3.1, 3.4, 3.5_

- [ ] 11. Frontend — Página de progresso e player
  - [ ] 11.1 Criar componentes de progresso em `src/client/components/video/`
    - `StepItem.tsx` — exibe uma etapa do pipeline com ícone de status (concluído ✓, em progresso (spinner), aguardando, erro ✗) e tempo de execução da etapa
    - `StepProgressList.tsx` — lista as 6 etapas do pipeline usando `StepItem`; atualiza visualmente a cada ciclo de polling
    - `EstimatedTimeDisplay.tsx` — exibe "Aproximadamente X minutos restantes" com base no campo `estimatedRemainingSeconds` da resposta
    - `ErrorRetryPanel.tsx` — exibe a etapa que falhou, a mensagem de erro descritiva e botão "Tentar Novamente" que cria novo job reutilizando o `rawVideoS3Key`
    - _Requisitos: 9.1, 9.2, 9.3, 9.5, 9.6_

  - [ ] 11.2 Criar componentes de player e resultado em `src/client/components/video/`
    - `VideoPlayer.tsx` — player HTML5 nativo com controles de play, pause, volume e tela cheia; carrega o vídeo via URL de streaming (presigned) quando `status === "completed"`
    - `DownloadButton.tsx` — chama `GET /api/video/jobs/[id]/download` para obter URL assinada e inicia download direto no dispositivo
    - `VideoMetadataCard.tsx` — exibe duração, resolução, tamanho do arquivo, data de geração e créditos consumidos
    - `RegenerateButton.tsx` — visível somente quando `rawVideoS3Key` ainda está disponível; cria novo job reaproveitando o vídeo bruto existente
    - _Requisitos: 9.4, 10.1, 10.2, 10.3, 10.4, 10.5_

  - [ ] 11.3 Criar página de progresso/detalhe `src/app/(dashboard)/video/[id]/page.tsx`
    - Implementar polling a cada 3 segundos via `useEffect` + `setInterval` chamando `GET /api/video/jobs/[id]`
    - Renderizar `StepProgressList` + `EstimatedTimeDisplay` enquanto `status !== "completed"` e `status !== "error"`
    - Renderizar `VideoPlayer` + `DownloadButton` + `VideoMetadataCard` quando `status === "completed"`
    - Renderizar `ErrorRetryPanel` quando `status === "error"`
    - Parar polling quando status final (`completed` ou `error`) for atingido
    - _Requisitos: 9.1, 9.2, 9.3, 9.4, 9.5, 10.1_

- [ ] 12. Checkpoint — Revisão da interface
  - Garantir que o projeto compila sem erros TypeScript e ESLint. Verificar que o wizard completo, a galeria e a página de progresso renderizam sem crash em modo de desenvolvimento local.

- [ ] 13. Trilhas sonoras e testes finais
  - [ ] 13.1 Adicionar arquivos de trilha sonora CC0 em `public/audio/music/`
    - Adicionar os 5 arquivos MP3 conforme definido no design: `energetic-upbeat.mp3`, `smooth-corporate.mp3`, `corporate-professional.mp3`, `inspirational-rise.mp3`, `upbeat-modern.mp3`
    - Cada arquivo deve ter duração mínima de 120 segundos e ser royalty-free (CC0 ou equivalente)
    - Verificar que o `video-assembler.service.ts` consegue ler esses arquivos via caminho relativo ao `process.cwd()`
    - _Requisitos: 8.1, 8.3_

  - [ ]* 13.2 Escrever testes unitários para as funções puras
    - Criar `src/__tests__/video-validations.test.ts`: cobrir casos limite de `isValidVideoFile` (0 bytes, 500MB exato, 500MB+1), `isValidContextDescription` (9 chars, 10 chars, 500 chars, 501 chars), `getAspectRatio` (todos os valores válidos), `calculateExtractionParams` (30s, 60s, 61s, 600s)
    - Criar `src/__tests__/frame-selector.test.ts`: cobrir `histogramDiff` com histogramas idênticos (diff = 0), histogramas opostos; cobrir `selectRepresentativeFrames` garantindo que primeiro e último frame estão sempre incluídos
    - _Requisitos: 4.2, 4.6, 2.2, 2.3, 2.4, 2.9, 3.3_

  - [ ]* 13.3 Escrever teste de integração do pipeline completo
    - Criar `src/__tests__/video-pipeline.integration.test.ts` com mocks de `@aws-sdk/client-s3`, `@aws-sdk/client-polly` e do cliente Bedrock
    - Teste 1: pipeline feliz completo — job criado → frames extraídos → transformados → narração gerada → vídeo montado → status `"completed"` → crédito deduzido
    - Teste 2: falha na extração de frames — job termina com `status: "error"` e crédito NÃO é deduzido
    - Teste 3: falha no Stable Diffusion com fallback — frame original é usado e pipeline continua até conclusão
    - _Requisitos: 4.5, 6.5, 8.6, 8.7_

- [ ] 14. Checkpoint final — Todos os testes passam
  - Executar `npx jest --run` (ou `npx jest --forceExit`). Garantir que todos os testes unitários, de propriedade e de integração passam. Resolver quaisquer falhas remanescentes. Verificar que `npx tsc --noEmit` não reporta erros.

---

## Notas

- Tarefas marcadas com `*` são opcionais e podem ser puladas para entrega de MVP mais rápido.
- Cada tarefa referencia os requisitos específicos que implementa para rastreabilidade.
- Os checkpoints (tarefas 4, 6, 8, 12 e 14) garantem validação incremental a cada fase.
- Os testes de propriedade usam a biblioteca **fast-check** com mínimo de 100 iterações por propriedade.
- O worker assíncrono usa o padrão fire-and-forget via `fetch` interno; em produção, recomenda-se mover para uma fila SQS ou Vercel Cron Job com `CRON_SECRET`.
- O isolamento multi-tenant é garantido em todos os artefatos S3 pelo prefixo `company_{companyId}` e pela verificação de `companyId` em todas as queries do banco.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "1.5", "3.1"] },
    { "id": 2, "tasks": ["1.4", "1.6", "3.2", "2.1", "2.2"] },
    { "id": 3, "tasks": ["5.1", "5.2", "5.3"] },
    { "id": 4, "tasks": ["5.4"] },
    { "id": 5, "tasks": ["5.5"] },
    { "id": 6, "tasks": ["7.1", "7.2", "7.3", "7.4", "7.5", "7.6"] },
    { "id": 7, "tasks": ["9.1", "9.2"] },
    { "id": 8, "tasks": ["9.3", "10.1", "10.2"] },
    { "id": 9, "tasks": ["10.3", "11.1", "11.2"] },
    { "id": 10, "tasks": ["11.3", "13.1"] },
    { "id": 11, "tasks": ["13.2", "13.3"] }
  ]
}
```
