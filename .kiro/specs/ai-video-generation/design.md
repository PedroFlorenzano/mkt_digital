# Documento de Design — Geração de Vídeos Curtos com IA

## Visão Geral

O módulo **Geração de Vídeos Curtos com IA** permite que assinantes dos planos Profissional e Agência criem reels e vídeos curtos de marketing a partir de um vídeo bruto filmado pelo próprio negócio. A IA analisa o vídeo enviado, extrai frames representativos, transforma cada frame em imagem de marketing com Stable Diffusion Ultra (AWS Bedrock), gera narração em português com Amazon Polly e monta o vídeo final com trilha sonora e texto sobreposto via `fluent-ffmpeg`. O resultado é um vídeo profissional e realista porque usa o material real do negócio como referência visual.

### Objetivos

- Entregar um pipeline end-to-end de geração de vídeo completamente dentro do ecossistema AWS (Bedrock, Polly, S3) sem depender de APIs de vídeo externas pagas.
- Manter rastreabilidade completa de custos por empresa e por job.
- Oferecer feedback de progresso em tempo real ao usuário via polling a cada 3 segundos.
- Garantir isolamento multi-tenant em todos os artefatos armazenados no S3.

### Escopo

- **Incluído:** upload de vídeo bruto, extração de frames com ffmpeg, análise e script com Claude, transformação de frames com Stable Diffusion Ultra, narração com Amazon Polly, montagem com ffmpeg, polling de status, galeria de histórico, controle de créditos mensais.
- **Excluído:** publicação automática em redes sociais (o usuário baixa o vídeo e publica manualmente), geração de legendas automáticas (SRT/VTT), edição pós-geração, suporte a múltiplos idiomas além de pt-BR.

---

## Arquitetura

### Diagrama de Componentes

```
┌──────────────────────────────────────────────────────────────────────┐
│                      BROWSER (Next.js Client)                        │
│                                                                      │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │ /video           │  │ /video/new        │  │ /video/[id]      │  │
│  │ (galeria)        │  │ (wizard upload)   │  │ (progresso/player│  │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘  │
│                                                                      │
│  VideoGalleryPage      VideoWizard            VideoProgressPage      │
│  VideoGalleryGrid      UploadDropzone         StepProgressList       │
│  VideoCard             ContextForm            VideoPlayer            │
│                        ConfigForm             DownloadButton         │
│                        CreditBadge            RetryButton            │
└────────────────────────────────┬─────────────────────────────────────┘
                                 │ fetch (REST JSON) + polling 3s
┌────────────────────────────────▼─────────────────────────────────────┐
│                   NEXT.JS API ROUTES (src/app/api/)                   │
│                                                                       │
│  POST   /api/video/upload          → URL assinada S3 para upload     │
│  POST   /api/video/jobs            → cria Job + enfileira pipeline   │
│  GET    /api/video/jobs            → lista jobs da empresa (paginado)│
│  GET    /api/video/jobs/[id]       → status + progresso do job       │
│  GET    /api/video/jobs/[id]/download → URL assinada do vídeo final  │
│  DELETE /api/video/jobs/[id]       → exclui job + artefatos S3       │
│  GET    /api/cron/video-worker     → processa próximo job na fila    │
└────────────────────────────────┬─────────────────────────────────────┘
                                 │
┌────────────────────────────────▼─────────────────────────────────────┐
│                  SERVER SERVICES (src/server/services/)               │
│                                                                       │
│  video-job.service.ts          (orquestração do pipeline)            │
│  frame-extractor.service.ts    (ffmpeg: extração + seleção)          │
│  frame-transformer.service.ts  (Stable Diffusion Ultra via Bedrock)  │
│  narration.service.ts          (Amazon Polly)                        │
│  video-assembler.service.ts    (ffmpeg: montagem final)              │
└──────┬────────────────┬──────────────────┬───────────────────────────┘
       │                │                  │
┌──────▼──────┐  ┌──────▼──────┐  ┌───────▼──────────┐
│  LIBS       │  │  AWS SDK    │  │  fluent-ffmpeg    │
│             │  │             │  │  (npm package)    │
│ aws-polly.ts│  │ Bedrock     │  │  frame extraction │
│ s3-video.ts │  │ Claude      │  │  video assembly   │
│ frame-      │  │ Stable      │  └──────────────────┘
│ selector.ts │  │ Diffusion   │
│             │  │ Ultra       │
└──────┬──────┘  └──────┬──────┘
       │                │
┌──────▼────────────────▼──────────────────────────────┐
│                 EXTERNAL SERVICES                      │
│                                                        │
│  AWS S3          (armazenamento de todos os artefatos) │
│  AWS Bedrock     (Claude + Stable Diffusion Ultra)     │
│  Amazon Polly    (text-to-speech pt-BR)                │
└────────────────────────────────────────────────────────┘
```

### Fluxo de Processamento Assíncrono

O processamento é assíncrono. A API route `POST /api/video/jobs` cria o job e imediatamente aciona `fetch('internal', '/api/cron/video-worker')` sem aguardar resposta (fire-and-forget usando `waitUntil` ou response.body discard). O worker em `/api/cron/video-worker` processa um job por vez seguindo a ordem da fila. O frontend faz polling a cada 3 segundos em `GET /api/video/jobs/[id]`.

---

## Diagramas de Sequência

### Fluxo Completo de Criação de Vídeo

```
Usuário         Frontend          API Routes            Worker              AWS
  │                │                  │                    │                 │
  │─ seleciona ──►│                  │                    │                 │
  │  arquivo      │                  │                    │                 │
  │               │─POST /upload────►│                    │                 │
  │               │◄── presigned URL─│                    │                 │
  │               │─ PUT S3 (direto)─┼────────────────────┼────────────────►│
  │               │◄─── 200 OK ──────┼────────────────────┼─────────────────│
  │               │                  │                    │                 │
  │─ configura ──►│                  │                    │                 │
  │  wizard       │─POST /jobs──────►│                    │                 │
  │               │                  │─ cria VideoJob     │                 │
  │               │                  │  status=queued     │                 │
  │               │                  │─ fire-and-forget──►│                 │
  │               │◄── jobId ────────│                    │                 │
  │               │                  │                    │                 │
  │  [polling a cada 3s]             │                    │                 │
  │               │─GET /jobs/[id]──►│                    │                 │
  │               │◄── status+% ─────│                    │                 │
  │               │                  │         [worker executa pipeline]    │
  │               │                  │                    │─ download ─────►│
  │               │                  │                    │  vídeo bruto S3 │
  │               │                  │                    │◄── arquivo ─────│
  │               │                  │                    │─ ffmpeg extract │
  │               │                  │                    │  frames         │
  │               │                  │                    │─ upload ────────►│
  │               │                  │                    │  frames S3      │
  │               │                  │                    │─ Claude ────────►│
  │               │                  │                    │  análise frames │
  │               │                  │                    │◄── brief.json ──│
  │               │                  │                    │─ Stable Diff ───►│
  │               │                  │                    │  transf. frames │
  │               │                  │                    │◄── frames tx ───│
  │               │                  │                    │─ Polly ─────────►│
  │               │                  │                    │  narração MP3   │
  │               │                  │                    │◄── audio ───────│
  │               │                  │                    │─ ffmpeg assemble│
  │               │                  │                    │─ upload ────────►│
  │               │                  │                    │  vídeo final S3 │
  │               │                  │                    │─ status=done    │
  │               │                  │                    │  deduz crédito  │
  │               │─GET /jobs/[id]──►│                    │                 │
  │               │◄── status=done ──│                    │                 │
  │◄── player ───│                  │                    │                 │
```

### Fluxo de Polling

```
Frontend                    API Route
   │                            │
   │──GET /jobs/[id]───────────►│
   │                            │── SELECT VideoJob WHERE id = ?
   │◄── { status, progress,     │
   │      stepDurations,        │
   │      estimatedRemaining }──│
   │                            │
   │  [aguarda 3s]              │
   │──GET /jobs/[id]───────────►│
   │◄── { status: "completed",  │
   │      videoUrl (presigned) }│
   │                            │
   │  [exibe player]            │
```

---

## Schema do Banco de Dados (Prisma)

Adições ao `prisma/schema.prisma`. Todos os modelos usam `companyId` como chave de isolamento multi-tenant.

```prisma
// ─────────────────────────────────────────────
// Módulo: Geração de Vídeos Curtos com IA
// ─────────────────────────────────────────────

/// Job de geração de vídeo — representa uma execução completa do pipeline.
/// Cada etapa do pipeline atualiza o campo `status` e `progress`.
model VideoJob {
  id              String    @id @default(cuid())
  companyId       String

  /// Status do pipeline: queued | extracting_frames | frames_extracted |
  ///   generating_script | script_generated | transforming_frames |
  ///   frames_transformed | generating_narration | narration_generated |
  ///   assembling | completed | error
  status          String    @default("queued")

  /// Percentual de progresso geral: 0-100
  progress        Int       @default(0)

  /// Mensagem de erro descritiva (preenchida quando status = 'error')
  errorMessage    String?

  // ── Configurações do job ──────────────────────────────────────────────
  /// Formato: 'instagram_reels' | 'tiktok' | 'youtube_shorts'
  platform        String

  /// Duração alvo em segundos: 15 | 30 | 60
  targetDuration  Int

  /// Estilo visual: 'realistic' | 'cinematic' | 'minimalist'
  visualStyle     String

  /// Chamada para ação personalizada (ex.: "Agende agora pelo WhatsApp")
  ctaText         String?

  /// Tom de voz herdado da empresa (pode ser sobrescrito para este job)
  tone            String

  /// Voz Polly: 'Camila' | 'Ricardo'
  narratorVoice   String    @default("Camila")

  /// Descrição de contexto fornecida pelo usuário (10-500 chars)
  contextDescription String

  // ── Artefatos S3 ─────────────────────────────────────────────────────
  /// Caminho S3 do vídeo bruto: videos/{jobId}/raw/original.{ext}
  rawVideoS3Key   String?

  /// Caminho S3 do brief JSON: videos/{jobId}/brief.json
  briefS3Key      String?

  /// Caminho S3 do vídeo final: videos/{jobId}/output/final.mp4
  outputS3Key     String?

  // ── Metadados do resultado ────────────────────────────────────────────
  /// Número de frames extraídos do vídeo bruto
  framesExtracted Int?

  /// Número de frames efetivamente transformados pelo Stable Diffusion
  framesTransformed Int?

  /// Duração real do vídeo final em segundos
  outputDurationSeconds Int?

  /// Tamanho do arquivo de saída em bytes
  outputFileSizeBytes   BigInt?

  /// Resolução do vídeo final: '1080x1920' ou '1920x1080'
  outputResolution  String?

  /// JSON array com duração de cada etapa em ms: { step, durationMs }
  stepDurationsJson String?

  /// Custo total estimado do job em USD (soma de todos os CostLog)
  estimatedCostUsd  Float?

  /// Flag indicando se o crédito foi deduzido
  creditDeducted    Boolean   @default(false)

  createdAt         DateTime  @default(now())
  startedAt         DateTime?
  completedAt       DateTime?
  updatedAt         DateTime  @updatedAt

  company     Company       @relation(fields: [companyId], references: [id], onDelete: Cascade)
  costLogs    CostLog[]

  @@index([companyId])
  @@index([companyId, status])
  @@index([status])
  @@index([createdAt])
}

/// Saldo mensal de créditos de vídeo por empresa.
/// Um registro por empresa por período de cobrança.
model VideoCredit {
  id              String   @id @default(cuid())
  companyId       String

  /// Período de cobrança: primeiro dia do mês, ex.: 2025-06-01T00:00:00Z
  billingPeriodStart DateTime

  /// Créditos totais disponíveis no plano para este período
  totalCredits    Int

  /// Créditos já consumidos no período
  usedCredits     Int      @default(0)

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  company Company @relation(fields: [companyId], references: [id], onDelete: Cascade)

  @@unique([companyId, billingPeriodStart])
  @@index([companyId])
}
```

### Adições ao modelo `Company`

```prisma
// Adicionar ao model Company existente:
  videoJobs    VideoJob[]
  videoCredits VideoCredit[]
```

### Adições ao modelo `CostLog`

O campo `type` do `CostLog` existente será estendido com os novos valores:
- `"video_analysis"` — chamadas Claude para análise de frames
- `"video_transform"` — chamadas Stable Diffusion para transformação de frames
- `"video_narration"` — caracteres sintetizados pelo Amazon Polly
- `"video_job"` — registro consolidado do custo total do job

O campo `metadata` (JSON string) armazenará o `videoJobId` para rastreabilidade.

---

## Componentes e Interfaces

### Interfaces TypeScript

```typescript
// src/server/services/video-job.service.ts — tipos exportados

/** Status possíveis de um VideoJob ao longo do pipeline */
export type VideoJobStatus =
  | "queued"
  | "extracting_frames"
  | "frames_extracted"
  | "generating_script"
  | "script_generated"
  | "transforming_frames"
  | "frames_transformed"
  | "generating_narration"
  | "narration_generated"
  | "assembling"
  | "completed"
  | "error";

/** Rede social de destino do vídeo final */
export type VideoPlatform = "instagram_reels" | "tiktok" | "youtube_shorts";

/** Estilo visual aplicado na transformação de frames */
export type VideoVisualStyle = "realistic" | "cinematic" | "minimalist";

/** Voz do Amazon Polly disponível */
export type PollyVoice = "Camila" | "Ricardo";

/** Configuração fornecida pelo usuário ao criar o job */
export interface VideoJobConfig {
  companyId:          string;
  rawVideoS3Key:      string;        // chave S3 do vídeo bruto já uploaded
  platform:           VideoPlatform;
  targetDuration:     15 | 30 | 60; // segundos
  visualStyle:        VideoVisualStyle;
  ctaText?:           string;        // chamada para ação (opcional)
  tone:               string;        // herda do perfil da empresa
  narratorVoice:      PollyVoice;
  contextDescription: string;        // 10-500 chars
}

/** Texto sobreposto com timestamp de exibição */
export interface OverlayText {
  text:         string; // máximo 80 caracteres
  startSeconds: number; // >= 0, deve estar em ordem crescente
}

/** Prompt de transformação para um frame específico */
export interface FramePrompt {
  frameIndex: number;
  prompt:     string;
}

/** Artefato JSON do pipeline gerado pelo Analisador IA (Claude) */
export interface VideoPipelineBrief {
  jobId:          string;
  script:         string[];       // sentenças da narração
  framePrompts:   FramePrompt[];  // um por frame selecionado
  overlayTexts:   OverlayText[];  // máximo 5 entradas
  musicCategory:  "energetic" | "smooth" | "corporate" | "inspirational" | "upbeat";
}

/** Resultado da etapa de extração de frames */
export interface FrameExtractionResult {
  totalFrames:       number;       // frames extraídos do vídeo
  selectedFrames:    number[];     // índices dos frames selecionados (até 10)
  extractionInterval: number;      // 1 ou 2 segundos
  s3Keys:            string[];     // chaves S3 dos frames extraídos
}

/** Resultado de uma transformação de frame pelo Stable Diffusion */
export interface FrameTransformResult {
  frameIndex:  number;
  s3Key:       string;
  usedFallback: boolean; // true se usou frame original após 2 falhas
  costUsd:     number;
}

/** Resultado da geração de narração pelo Amazon Polly */
export interface NarrationResult {
  s3Key:            string;       // chave S3 do MP3 gerado
  characterCount:   number;       // usado para cálculo de custo Polly
  durationSeconds:  number;       // duração estimada do áudio
}

/** Resultado final da montagem do vídeo */
export interface VideoGenerationResult {
  jobId:            string;
  outputS3Key:      string;       // chave S3 do vídeo final MP4
  durationSeconds:  number;       // duração real do vídeo
  fileSizeBytes:    number;
  resolution:       string;       // '1080x1920' ou '1920x1080'
  totalCostUsd:     number;
}

/** Resposta de status retornada pelo endpoint GET /api/video/jobs/[id] */
export interface VideoJobStatusResponse {
  id:               string;
  status:           VideoJobStatus;
  progress:         number;        // 0-100
  platform:         VideoPlatform;
  targetDuration:   number;
  errorMessage?:    string;
  stepDurations:    Array<{ step: string; durationMs: number }>;
  estimatedRemainingSeconds?: number;
  // Preenchidos apenas quando status === 'completed'
  outputDurationSeconds?: number;
  outputFileSizeBytes?:   number;
  outputResolution?:      string;
  creditDeducted?:        boolean;
  createdAt:        string;
  completedAt?:     string;
}
```

---

## API Routes

### `POST /api/video/upload`

Retorna uma URL pré-assinada do S3 para upload direto pelo cliente.

**Body:**
```json
{
  "fileName": "meu-video.mp4",
  "fileSize": 52428800,
  "mimeType": "video/mp4"
}
```

**Response `200`:**
```json
{
  "uploadUrl": "https://s3.amazonaws.com/...?X-Amz-Signature=...",
  "s3Key": "videos/raw/company_{id}/{uuid}.mp4",
  "expiresIn": 3600
}
```

**Erros:** `400` formato inválido ou tamanho > 500MB | `401` não autenticado | `403` plano não elegível

---

### `POST /api/video/jobs`

Cria um `VideoJob`, valida créditos e aciona o worker assíncrono.

**Body:**
```json
{
  "rawVideoS3Key":       "videos/raw/company_{id}/{uuid}.mp4",
  "platform":           "instagram_reels",
  "targetDuration":     30,
  "visualStyle":        "realistic",
  "ctaText":            "Agende pelo WhatsApp",
  "narratorVoice":      "Camila",
  "contextDescription": "Máquina nova de limpeza de pele para clínica de estética"
}
```

**Response `201`:**
```json
{
  "jobId": "clxxx...",
  "status": "queued",
  "creditsRemaining": 4
}
```

**Erros:** `400` validação | `401` não autenticado | `403` plano inelegível ou créditos zerados

---

### `GET /api/video/jobs`

Lista paginada dos jobs da empresa autenticada.

**Query params:** `page` (default 1), `pageSize` (default 12), `status` (opcional), `from` / `to` (datas ISO)

**Response `200`:**
```json
{
  "jobs": [
    {
      "id": "clxxx...",
      "status": "completed",
      "platform": "instagram_reels",
      "targetDuration": 30,
      "thumbnailUrl": "https://...",
      "createdAt": "2025-06-01T10:00:00Z",
      "creditDeducted": true
    }
  ],
  "pagination": { "page": 1, "pageSize": 12, "total": 28, "totalPages": 3 }
}
```

---

### `GET /api/video/jobs/[id]`

Retorna o status detalhado de um job para polling.

**Response `200`:** `VideoJobStatusResponse` (ver interface acima)

**Erros:** `401` | `403` job não pertence à empresa | `404`

---

### `GET /api/video/jobs/[id]/download`

Gera URL assinada temporária (24h) para download do vídeo final.

**Response `200`:**
```json
{
  "downloadUrl": "https://s3.amazonaws.com/...?X-Amz-Signature=...",
  "fileName": "video-final-2025-06-01.mp4",
  "expiresAt": "2025-06-02T10:00:00Z"
}
```

**Erros:** `404` job não encontrado ou não concluído | `403`

---

### `DELETE /api/video/jobs/[id]`

Remove o job do banco de dados e todos os artefatos S3 associados (vídeo bruto, frames, narração, vídeo final).

**Response `204`:** sem corpo

**Erros:** `401` | `403` | `404`

---

### `GET /api/cron/video-worker`

Endpoint interno do worker. Protegido por `CRON_SECRET` no header `Authorization: Bearer`.
Busca o próximo job com `status = 'queued'` e executa o pipeline completo.

**Response `200`:**
```json
{
  "processed": true,
  "jobId": "clxxx...",
  "finalStatus": "completed"
}
```

Quando não há jobs na fila: `{ "processed": false }`.

---

## Serviços

### `video-job.service.ts`

Orquestrador principal do pipeline. Responsabilidades:
- `createJob(config: VideoJobConfig): Promise<VideoJob>` — valida créditos, cria o registro no banco, aciona o worker.
- `runPipeline(jobId: string): Promise<void>` — executa cada etapa em sequência, atualizando status e progresso após cada uma.
- `getJobStatus(jobId: string, companyId: string): Promise<VideoJobStatusResponse>` — leitura de status para polling.
- `listJobs(companyId, options): Promise<{ jobs, pagination }>` — listagem paginada.
- `deleteJob(jobId: string, companyId: string): Promise<void>` — remoção de job e artefatos S3.
- `deductCredit(companyId: string, jobId: string): Promise<void>` — deduz 1 crédito do `VideoCredit` do período corrente.
- `estimateRemainingTime(jobId: string): Promise<number>` — calcula estimativa em segundos com base no tempo médio das últimas 10 gerações.

**Mapeamento de progresso por etapa:**

| Etapa                    | Progresso |
|--------------------------|-----------|
| queued                   | 0%        |
| extracting_frames        | 10%       |
| frames_extracted         | 20%       |
| generating_script        | 30%       |
| script_generated         | 40%       |
| transforming_frames      | 50–70%    |
| frames_transformed       | 70%       |
| generating_narration     | 80%       |
| narration_generated      | 85%       |
| assembling               | 90%       |
| completed                | 100%      |

### `frame-extractor.service.ts`

Responsabilidades:
- `extractFrames(jobId, rawS3Key, durationSeconds): Promise<FrameExtractionResult>` — baixa o vídeo do S3 para diretório temporário, executa extração via `fluent-ffmpeg`, faz upload dos JPEGs para S3 e limpa arquivos locais.
- Calcula o intervalo: `durationSeconds <= 60 ? 1 : 2` segundos.
- Limita a 60 frames máximo.
- Delega seleção de subconjunto representativo para `frame-selector.ts`.

### `frame-transformer.service.ts`

Responsabilidades:
- `transformFrames(jobId, frames, prompts, style): Promise<FrameTransformResult[]>` — processa cada frame em sequência via Stable Diffusion Ultra (image-to-image, `strength: 0.65`), armazena no S3, registra custo em `CostLog`. Aplica fallback para frame original após 2 falhas.
- Limita a 30 frames transformados por job.
- Frames excedentes serão interpolados pelo montador.

### `narration.service.ts`

Responsabilidades:
- `generateNarration(jobId, script, voice): Promise<NarrationResult>` — envia script para Amazon Polly via `aws-polly.ts`, armazena MP3 no S3, registra custo em `CostLog`.

### `video-assembler.service.ts`

Responsabilidades:
- `assembleVideo(jobId, config): Promise<VideoGenerationResult>` — baixa frames transformados e narração do S3, seleciona trilha sonora por categoria, executa montagem com `fluent-ffmpeg`, ajusta velocidade se necessário para respeitar duração-alvo ±5s, faz upload do MP4 final.
- Codec de vídeo: `libx264`, codec de áudio: `aac`, bitrate: `4000k`.
- Mistura de áudio: narração 100% + trilha 20%.
- Texto sobreposto: fonte `Arial`, 28pt, cor branca, sombra preta `2px`.

---

## Libs

### `src/server/lib/aws-polly.ts`

Wrapper para o cliente Amazon Polly:

```typescript
export interface PollyConfig {
  voice: PollyVoice;      // 'Camila' | 'Ricardo'
  text:  string;
  outputFormat: 'mp3';
  sampleRate:   '22050';
}

export async function synthesizeSpeech(config: PollyConfig): Promise<Buffer>
```

Usa `@aws-sdk/client-polly`. Região: `us-east-1` (configurável via `AWS_POLLY_REGION`). Lança `ExternalServiceError` em caso de falha.

### `src/server/lib/s3-video.ts`

Helpers para upload/download de artefatos de vídeo:

```typescript
export async function uploadVideoArtifact(
  s3Key: string,
  body: Buffer | Readable,
  contentType: string,
): Promise<void>

export async function downloadVideoArtifact(s3Key: string): Promise<Buffer>

export async function generatePresignedUploadUrl(
  s3Key: string,
  contentType: string,
  expiresIn: number,
): Promise<string>

export async function generatePresignedDownloadUrl(
  s3Key: string,
  expiresIn: number,
): Promise<string>

export async function deleteVideoArtifacts(s3Keys: string[]): Promise<void>

export function buildJobS3Prefix(jobId: string): string
// retorna: `videos/${jobId}/`
```

Usa `@aws-sdk/client-s3` e `@aws-sdk/s3-request-presigner`. Bucket: `process.env.AWS_S3_VIDEO_BUCKET`.

### `src/server/lib/frame-selector.ts`

Seleção de frames representativos por diferença de histograma:

```typescript
export interface FrameHistogram {
  frameIndex: number;
  s3Key:      string;
  histogram:  number[]; // 256 bins, canal de luminância
}

/** Seleciona até maxFrames frames com maior variação visual cumulativa */
export function selectRepresentativeFrames(
  frames: FrameHistogram[],
  maxFrames: number = 10,
): FrameHistogram[]

/** Calcula diferença de histograma entre dois frames (soma de diff absoluta) */
export function histogramDiff(a: number[], b: number[]): number
```

**Algoritmo:** Ordena frames por diferença cumulativa em relação ao frame anterior e seleciona os `maxFrames` com maior variação, garantindo que o primeiro e o último frame do vídeo sempre estejam incluídos.

---

## Modelos de Dados

### VideoPipelineBrief (artefato JSON armazenado no S3)

```json
{
  "jobId": "clxxx...",
  "script": [
    "Conheça nossa nova máquina de limpeza de pele.",
    "Tecnologia avançada para resultados profissionais.",
    "Agende agora pelo WhatsApp."
  ],
  "framePrompts": [
    {
      "frameIndex": 0,
      "prompt": "Professional aesthetic clinic interior, modern equipment, clean minimalist style, warm lighting, brand colors #3B82F6 and #FFFFFF"
    }
  ],
  "overlayTexts": [
    { "text": "Nova Tecnologia em Estética", "startSeconds": 0 },
    { "text": "Resultados Profissionais",    "startSeconds": 10 },
    { "text": "Agende pelo WhatsApp",        "startSeconds": 25 }
  ],
  "musicCategory": "smooth"
}
```

### Trilhas Sonoras (arquivos incluídos no repositório)

Localização: `public/audio/music/`

| Arquivo                  | Categoria     | Mood            | BPM  |
|--------------------------|---------------|-----------------|------|
| `energetic-upbeat.mp3`   | energetic     | Animado, rápido | 128  |
| `smooth-corporate.mp3`   | smooth        | Suave, relaxado | 80   |
| `corporate-professional.mp3` | corporate | Profissional    | 100  |
| `inspirational-rise.mp3` | inspirational | Motivacional    | 95   |
| `upbeat-modern.mp3`      | upbeat        | Moderno, jovem  | 120  |

Todos os arquivos são royalty-free (licença Creative Commons Zero / CC0 ou equivalente). Duração mínima de 120 segundos cada para cobrir todos os cenários de duração. O `video-assembler.service.ts` seleciona o arquivo baseado no campo `musicCategory` do `VideoPipelineBrief`.

---

## Hierarquia de Componentes Frontend

```
src/app/(dashboard)/video/
  page.tsx                          → VideoGalleryPage (SSR com dados iniciais)
  new/
    page.tsx                        → VideoNewPage (wizard)
  [id]/
    page.tsx                        → VideoDetailPage (polling + player)

src/client/components/video/
  VideoGalleryPage.tsx
  ├── CreditBadge.tsx               → exibe saldo restante de créditos
  ├── NewVideoButton.tsx            → botão que leva ao wizard
  └── VideoGalleryGrid.tsx
      └── VideoCard.tsx             → thumbnail, status, data, ações

  VideoWizard.tsx                   → wizard multi-etapa com 3 steps
  ├── Step1Upload.tsx
  │   ├── UploadDropzone.tsx        → drag-and-drop com progresso
  │   └── VideoContextForm.tsx      → campo de descrição de contexto
  ├── Step2Config.tsx
  │   ├── PlatformSelector.tsx      → Instagram / TikTok / YouTube
  │   ├── DurationSelector.tsx      → 15s / 30s / 60s
  │   ├── StyleSelector.tsx         → realista / cinematográfico / minimalista
  │   ├── CTAInput.tsx              → chamada para ação
  │   └── VoiceSelector.tsx         → Camila / Ricardo
  └── Step3Review.tsx               → resumo das configurações + botão confirmar

  VideoProgressPage.tsx             → polling a cada 3s
  ├── StepProgressList.tsx          → lista de etapas com ícones de status
  │   └── StepItem.tsx             → concluído / em progresso / aguardando / erro
  ├── EstimatedTimeDisplay.tsx      → "Aproximadamente X minutos restantes"
  └── ErrorRetryPanel.tsx           → mensagem de erro + botão tentar novamente

  VideoDetailPage.tsx               → player + download + metadados
  ├── VideoPlayer.tsx               → player HTML5 nativo com controles
  ├── DownloadButton.tsx            → dispara download via URL assinada
  ├── VideoMetadataCard.tsx         → duração, resolução, tamanho, crédito
  └── RegenerateButton.tsx          → reutiliza frames existentes
```

---

## Tratamento de Erros

### Hierarquia de Erros do Pipeline

Cada etapa do pipeline trata erros de forma diferente quanto ao consumo de créditos:

| Etapa                   | Crédito deduido? | Comportamento de erro                        |
|-------------------------|------------------|----------------------------------------------|
| Upload / criação job    | Não              | Retorna erro HTTP, job não criado            |
| Extração de frames      | Não              | status = "error", estorna reserva            |
| Análise IA (Claude)     | Não              | status = "error", sem penalidade             |
| Transformação (SD)      | Não*             | Fallback para frame original, continua       |
| Geração narração (Polly)| Não              | status = "error", sem penalidade             |
| Montagem (ffmpeg)       | Não              | status = "error", sem penalidade             |
| Upload vídeo final S3   | Não              | Registra falha para retry, não muda status   |
| Status = "completed"    | **Sim**          | Deduz 1 crédito atomicamente                 |

\* Os custos de chamadas Stable Diffusion bem-sucedidas são registrados individualmente, mas o crédito de vídeo só é deduzido no sucesso total.

### Limite de Custo por Job

Se o custo estimado de um job exceder USD 2,00 durante a execução, o worker tenta suspender o job (status = "error", mensagem "limite de custo excedido") e notifica o administrador via log. Se a suspensão falhar, o job continua e o evento é registrado para auditoria.

### Notificações de Erro ao Usuário

Erros são surfaced via o endpoint de polling: `GET /api/video/jobs/[id]` retorna `status: "error"` com `errorMessage` descritivo. O frontend exibe o painel de erro com botão de retry que cria um novo job reutilizando o `rawVideoS3Key` existente.

---

## Estratégia de Testes

### Testes Unitários

- Validações puras (`isValidVideoFormat`, `isValidFileSize`, `isValidVideoDuration`, `canGenerateVideo`, `isScriptDurationValid`)
- Lógica de seleção de frames (`selectRepresentativeFrames`, `histogramDiff`)
- Serialização e validação de `VideoPipelineBrief`
- Mapeamento de plataforma para proporção de aspecto
- Cálculo de parâmetros de extração de frames

### Testes de Integração

- Pipeline completo com mocks de Bedrock, Polly e S3 (1-3 exemplos)
- Criação de job com verificação de créditos
- Polling de status com mudança de etapas

### Testes de Propriedade (Property-Based Testing)

Utilizando a biblioteca **fast-check** (já disponível no ecossistema TypeScript/Jest) com mínimo de 100 iterações por propriedade.

As propriedades testáveis são descritas na seção Correctness Properties abaixo.

---

## Correctness Properties

*Uma propriedade é uma característica ou comportamento que deve se manter verdadeiro em todas as execuções válidas de um sistema — essencialmente, uma declaração formal sobre o que o sistema deve fazer. As propriedades servem como ponte entre especificações legíveis por humanos e garantias de corretude verificáveis por máquina.*

---

### Property 1: Controle de acesso por plano é bicondicional

*Para todo* nome de plano de assinatura, a função `requireVideoAccess` deve retornar acesso permitido se e somente se o plano for exatamente `"Profissional"` ou `"Agencia"`. Qualquer outro nome de plano, incluindo variações de capitalização, strings vazias e strings arbitrárias, deve resultar em acesso negado.

**Validates: Requirements 1.1, 1.2**

---

### Property 2: Verificação de créditos é monotônica

*Para todo* saldo de créditos `n` (inteiro), `canGenerateVideo(n)` deve retornar `true` se e somente se `n > 0`. A função nunca deve retornar `true` para `n <= 0` independentemente do valor.

**Validates: Requirements 1.5, 3.4**

---

### Property 3: Validação de formato de arquivo é exaustiva

*Para todo* tipo MIME de vídeo, `isValidVideoFormat(mimeType)` deve retornar `true` se e somente se o mimeType pertencer ao conjunto `{ "video/mp4", "video/quicktime", "video/webm" }`. Qualquer outro tipo MIME deve ser rejeitado.

**Validates: Requirements 2.1**

---

### Property 4: Validação de tamanho e duração de vídeo formam um intervalo fechado

*Para todo* par `(fileSizeBytes, durationSeconds)`, a função `isValidVideoFile(size, duration)` deve retornar `true` se e somente se `size <= 524_288_000` (500 MB) **e** `3 <= duration <= 600` (3s a 10min). Qualquer valor fora desse intervalo, incluindo zero e negativos, deve resultar em rejeição.

**Validates: Requirements 2.2, 2.3, 2.4**

---

### Property 5: Validação de descrição de contexto respeita os limites de comprimento

*Para toda* string `s`, `isValidContextDescription(s)` deve retornar `true` se e somente se `10 <= s.length <= 500`. Strings compostas inteiramente de espaços em branco devem ser tratadas com seu comprimento real (sem trim), salvo especificação contrária.

**Validates: Requirements 2.9**

---

### Property 6: Mapeamento de plataforma para proporção de aspecto é total e determinístico

*Para toda* plataforma válida em `{ "instagram_reels", "tiktok", "youtube_shorts" }`, `getAspectRatio(platform)` deve sempre retornar a mesma proporção: `"9:16"` para `instagram_reels` e `tiktok`, e `"16:9"` para `youtube_shorts`. O mapeamento não deve variar entre chamadas com o mesmo input.

**Validates: Requirements 3.3**

---

### Property 7: Parâmetros de extração de frames respeitam as restrições de intervalo e contagem máxima

*Para toda* duração de vídeo `d` (em segundos, com `3 <= d <= 600`), a função `calculateExtractionParams(d)` deve retornar um objeto `{ interval, maxFrames }` tal que:
- `interval === 1` quando `d <= 60`, e `interval === 2` quando `d > 60`
- `maxFrames <= 60` sempre
- `Math.ceil(d / interval) <= maxFrames`

**Validates: Requirements 4.2**

---

### Property 8: Seleção de frames representativos é um subconjunto de cardinalidade limitada

*Para toda* lista de frames de entrada com comprimento `n >= 1`, `selectRepresentativeFrames(frames, maxFrames)` deve retornar uma lista `result` tal que:
- `result.length <= maxFrames`
- Todo elemento de `result` pertence a `frames` (é um subconjunto)
- `result.length <= n`

**Validates: Requirements 4.6**

---

### Property 9: Validação de duração do script respeita a tolerância de ±5 segundos

*Para todo* script (array de strings) e duração-alvo `t` em `{ 15, 30, 60 }`, `isScriptDurationValid(script, t)` deve retornar `true` se e somente se a duração estimada pelo script (`(totalWords / 120) * 60` segundos) satisfizer `Math.abs(estimatedDuration - t) <= 5`.

**Validates: Requirements 5.3**

---

### Property 10: Serialização de VideoPipelineBrief é um round-trip preservador de equivalência

*Para todo* `VideoPipelineBrief` válido `brief`, serializar e então desserializar deve produzir um objeto deepEqual ao original:
```
deepEqual(deserializeBrief(serializeBrief(brief)), brief) === true
```
Esta propriedade deve ser satisfeita para todos os campos obrigatórios (`jobId`, `script`, `framePrompts`, `overlayTexts`, `musicCategory`) com quaisquer valores válidos gerados.

**Validates: Requirements 13.1, 13.4**

---

### Property 11: Timestamps de overlayTexts devem ser não-negativos e monotonicamente crescentes

*Para toda* lista de `OverlayText[]` que passe a validação (`validateOverlayTimestamps` retorna `true`), todos os timestamps `startSeconds` devem satisfazer:
- `startSeconds >= 0` para todo elemento
- Para qualquer dois elementos consecutivos `i` e `i+1`: `overlayTexts[i].startSeconds < overlayTexts[i+1].startSeconds`

Listas com timestamps negativos ou fora de ordem devem ser rejeitadas pela validação.

**Validates: Requirements 13.5**

---

**Reflexão de Propriedades (eliminação de redundância):**

- Properties 3 e 4 poderiam ser combinadas em uma única "validação de upload", mas foram mantidas separadas porque testam funções distintas com espaços de input diferentes.
- Property 2 (créditos) complementa a Property 1 (plano): a Property 1 verifica o acesso pelo nome do plano, enquanto a Property 2 verifica o acesso pelo saldo numérico. Não são redundantes.
- Properties 10 e 11 cobrem aspectos distintos da serialização: a 10 cobre o round-trip geral, a 11 cobre a invariante de ordenação dos timestamps. Mantidas separadas porque a 11 é verificável independentemente do round-trip.
