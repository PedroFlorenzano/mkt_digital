import sharp from "sharp";

export type LogoPosition =
  | "bottom-right"
  | "bottom-left"
  | "top-right"
  | "top-left"
  | "center";

export interface OverlayOptions {
  /** Fração da largura da imagem base que o logo ocupará (0–1). Default 0.18 */
  widthRatio?: number;
  /** Margem em pixels nas bordas. Default 32 */
  margin?: number;
  /** Posição do overlay. Default "bottom-right" */
  position?: LogoPosition;
  /** Opacidade 0–1. Default 1 */
  opacity?: number;
  /** Formato de saída. Default "webp" */
  format?: "webp" | "png" | "jpeg";
  /** Qualidade (quando aplicável). Default 90 */
  quality?: number;
}

/**
 * Carrega o logo a partir de uma Data URL (ou URL http(s)).
 * Retorna um Buffer pronto para o sharp.
 */
export async function loadLogoBuffer(source: string): Promise<Buffer> {
  if (source.startsWith("data:")) {
    const commaIndex = source.indexOf(",");
    if (commaIndex === -1) throw new Error("Data URL malformada");
    const meta = source.slice(5, commaIndex);
    const payload = source.slice(commaIndex + 1);
    const isBase64 = meta.includes(";base64");
    return isBase64
      ? Buffer.from(payload, "base64")
      : Buffer.from(decodeURIComponent(payload), "utf8");
  }

  if (source.startsWith("http://") || source.startsWith("https://")) {
    const res = await fetch(source);
    if (!res.ok) {
      throw new Error(`Falha ao baixar logo: ${res.status} ${res.statusText}`);
    }
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  }

  throw new Error("Fonte de logo não suportada (use data: ou http(s))");
}

function gravityFor(position: LogoPosition): string {
  switch (position) {
    case "bottom-left":
      return "southwest";
    case "top-right":
      return "northeast";
    case "top-left":
      return "northwest";
    case "center":
      return "center";
    case "bottom-right":
    default:
      return "southeast";
  }
}

/**
 * Prepara o logo final: redimensionado, com padding transparente para criar
 * a margem desejada em relação à borda (sharp não tem offset em composite com gravity).
 */
async function prepareLogoLayer(
  logoBuffer: Buffer,
  targetWidth: number,
  margin: number,
  opacity: number,
): Promise<Buffer> {
  // Redimensiona o logo mantendo proporção
  const base = await sharp(logoBuffer)
    .resize({ width: targetWidth, withoutEnlargement: false })
    .ensureAlpha()
    .png()
    .toBuffer();

  // Se opacity < 1, multiplica o canal alpha existente via blend dest-in com um tile RGBA.
  const resized =
    opacity < 1
      ? await sharp(base)
          .composite([
            {
              input: Buffer.from([255, 255, 255, Math.round(opacity * 255)]),
              raw: { width: 1, height: 1, channels: 4 },
              tile: true,
              blend: "dest-in",
            },
          ])
          .png()
          .toBuffer()
      : base;

  if (margin <= 0) return resized;

  const meta = await sharp(resized).metadata();
  const w = meta.width ?? targetWidth;
  const h = meta.height ?? targetWidth;

  // Cria canvas transparente com padding = margin em todos os lados.
  // O logo é desenhado centralizado; com gravity na composite final,
  // a imagem resultante cola na borda respeitando a margin.
  return sharp({
    create: {
      width: w + margin * 2,
      height: h + margin * 2,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: resized, top: margin, left: margin }])
    .png()
    .toBuffer();
}

/**
 * Compõe o logo sobre a imagem base preservando proporções.
 * Aceita o logo como Data URL, URL http(s) ou Buffer.
 */
export async function overlayLogo(
  baseImage: Buffer,
  logo: string | Buffer,
  opts: OverlayOptions = {},
): Promise<Buffer> {
  const {
    widthRatio = 0.18,
    margin = 32,
    position = "bottom-right",
    opacity = 1,
    format = "webp",
    quality = 90,
  } = opts;

  const logoBuffer = typeof logo === "string" ? await loadLogoBuffer(logo) : logo;

  const baseMeta = await sharp(baseImage).metadata();
  if (!baseMeta.width || !baseMeta.height) {
    throw new Error("Imagem base sem dimensões detectáveis");
  }

  const targetLogoWidth = Math.max(32, Math.round(baseMeta.width * widthRatio));
  const logoLayer = await prepareLogoLayer(logoBuffer, targetLogoWidth, margin, opacity);

  const composer = sharp(baseImage).composite([
    { input: logoLayer, gravity: gravityFor(position) },
  ]);

  switch (format) {
    case "png":
      return composer.png().toBuffer();
    case "jpeg":
      return composer.jpeg({ quality }).toBuffer();
    case "webp":
    default:
      return composer.webp({ quality }).toBuffer();
  }
}

/**
 * Converte um Buffer para Data URL.
 */
export function bufferToDataUrl(
  buf: Buffer,
  mime: "image/webp" | "image/png" | "image/jpeg" = "image/webp",
): string {
  return `data:${mime};base64,${buf.toString("base64")}`;
}

/**
 * Normaliza e redimensiona um logo para armazenamento (max 512px de largura,
 * preserva canal alpha, saída PNG). Retorna Data URL.
 */
export async function normalizeLogoForStorage(
  input: Buffer,
  maxWidth = 512,
): Promise<string> {
  const normalized = await sharp(input)
    .ensureAlpha()
    .resize({ width: maxWidth, withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toBuffer();

  return bufferToDataUrl(normalized, "image/png");
}
