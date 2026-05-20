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

// ---------------------------------------------------------------------------
// Sobreposição de texto sobre imagem gerada por IA
// ---------------------------------------------------------------------------

export interface TextOverlayOptions {
  /** Texto principal (título/headline) */
  headline?: string;
  /** Texto secundário (corpo/legenda curta) */
  body?: string;
  /** Nome da empresa para rodapé */
  companyName?: string;
  /** Cores da marca [primary, secondary, background] */
  brandColors?: string[];
  /** Posição do bloco de texto: "bottom" | "top" | "center" */
  textPosition?: "bottom" | "top" | "center";
}

/** Converte hex (#RRGGBB) para { r, g, b } */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  const full = clean.length === 3
    ? clean.split("").map((c) => c + c).join("")
    : clean;
  return {
    r: parseInt(full.slice(0, 2), 16) || 0,
    g: parseInt(full.slice(2, 4), 16) || 0,
    b: parseInt(full.slice(4, 6), 16) || 0,
  };
}

/** Determina se o texto deve ser branco ou preto sobre uma cor de fundo */
function contrastColor(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  // Luminância relativa (fórmula WCAG)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#1a1a1a" : "#ffffff";
}

/** Quebra texto em linhas respeitando maxChars por linha */
function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length <= maxChars) {
      current = (current + " " + word).trim();
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Sobrepõe texto sobre uma imagem base64/buffer.
 * Retorna a imagem composta como Data URL PNG.
 */
export async function overlayText(
  baseImage: Buffer,
  opts: TextOverlayOptions = {},
): Promise<Buffer> {
  const {
    headline,
    body,
    companyName,
    brandColors = ["#3B82F6", "#1E40AF", "#FFFFFF"],
    textPosition = "bottom",
  } = opts;

  // Sem texto para sobrepor — retorna original
  if (!headline && !body && !companyName) return baseImage;

  const meta = await sharp(baseImage).metadata();
  const W = meta.width ?? 1024;
  const H = meta.height ?? 1024;

  const primaryColor = brandColors[0] ?? "#3B82F6";
  const textColor = contrastColor(primaryColor);
  const { r: pr, g: pg, b: pb } = hexToRgb(primaryColor);

  // Tamanhos de fonte proporcionais à imagem
  const headlineFontSize = Math.round(W * 0.048); // ~49px em 1024px (era 0.065)
  const bodyFontSize = Math.round(W * 0.030);     // ~31px em 1024px (era 0.038)
  const companyFontSize = Math.round(W * 0.022);  // ~23px em 1024px (era 0.028)
  const lineHeight = headlineFontSize * 1.3;
  const bodyLineHeight = bodyFontSize * 1.4;
  const padding = Math.round(W * 0.05);           // ~51px

  // Largura útil para o texto (com padding dos dois lados)
  const textWidth = W - padding * 2;

  // Quebra de linha — baseada na largura real disponível
  // Cada caractere ocupa ~0.58 * fontSize em largura média
  const maxCharsHeadline = Math.floor(textWidth / (headlineFontSize * 0.58));
  const maxCharsBody = Math.floor(textWidth / (bodyFontSize * 0.54));

  const headlineLines = headline ? wrapText(headline, maxCharsHeadline) : [];
  const bodyLines = body ? wrapText(body, maxCharsBody) : [];

  // Calcula altura do bloco de texto
  const headlineBlockH = headlineLines.length * lineHeight;
  const bodyBlockH = bodyLines.length * bodyLineHeight;
  const companyBlockH = companyName ? companyFontSize * 1.5 : 0;
  const totalTextH = headlineBlockH + (bodyBlockH > 0 ? bodyBlockH + padding * 0.5 : 0) + (companyBlockH > 0 ? companyBlockH + padding * 0.3 : 0);
  const overlayH = Math.round(totalTextH + padding * 2);

  // Posição Y do overlay
  let overlayY: number;
  if (textPosition === "top") overlayY = 0;
  else if (textPosition === "center") overlayY = Math.round((H - overlayH) / 2);
  else overlayY = H - overlayH; // bottom

  // Gera SVG com o bloco de texto
  let svgContent = "";
  let currentY = padding + headlineFontSize;

  // Headline
  for (const line of headlineLines) {
    const escaped = line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    svgContent += `<text x="${padding}" y="${currentY}" font-size="${headlineFontSize}" font-weight="700" font-family="Arial, Helvetica, sans-serif" fill="${textColor}" letter-spacing="-0.5">${escaped}</text>`;
    currentY += lineHeight;
  }

  // Body
  if (bodyLines.length > 0) {
    currentY += padding * 0.4;
    for (const line of bodyLines) {
      const escaped = line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      svgContent += `<text x="${padding}" y="${currentY}" font-size="${bodyFontSize}" font-weight="400" font-family="Arial, Helvetica, sans-serif" fill="${textColor}" opacity="0.9">${escaped}</text>`;
      currentY += bodyLineHeight;
    }
  }

  // Company name
  if (companyName) {
    currentY += padding * 0.3;
    const escaped = companyName.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    svgContent += `<text x="${padding}" y="${currentY}" font-size="${companyFontSize}" font-weight="600" font-family="Arial, Helvetica, sans-serif" fill="${textColor}" opacity="0.7">${escaped}</text>`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${overlayH}">
    <defs>
      <clipPath id="textClip">
        <rect x="${padding}" y="0" width="${textWidth}" height="${overlayH}"/>
      </clipPath>
    </defs>
    <rect width="${W}" height="${overlayH}" fill="rgb(${pr},${pg},${pb})" opacity="0.88" rx="0"/>
    <g clip-path="url(#textClip)">
      ${svgContent}
    </g>
  </svg>`;

  const overlayBuffer = Buffer.from(svg);

  // Compõe overlay sobre a imagem base
  return sharp(baseImage)
    .composite([{
      input: overlayBuffer,
      top: overlayY,
      left: 0,
    }])
    .png()
    .toBuffer();
}

// ---------------------------------------------------------------------------
// Templates de layout para posts de marketing
// ---------------------------------------------------------------------------

export type LayoutTemplate =
  | "text-left"      // Texto à esquerda em fundo escuro, imagem à direita (estilo FullCycle)
  | "text-bottom"    // Faixa de texto no rodapé (atual)
  | "text-top"       // Faixa de texto no topo
  | "text-center"    // Texto centralizado com overlay
  | "split-dark";    // Metade escura com texto, metade com imagem

export interface LayoutOptions {
  template: LayoutTemplate;
  headline?: string;
  body?: string;
  companyName?: string;
  brandColors?: string[];
  logoBuffer?: Buffer;
}

/**
 * Aplica um template de layout sobre a imagem base.
 * Retorna Buffer PNG.
 */
export async function applyLayoutTemplate(
  baseImage: Buffer,
  opts: LayoutOptions,
): Promise<Buffer> {
  const {
    template,
    headline,
    body,
    companyName,
    brandColors = ["#1a1a2e", "#3B82F6", "#FFFFFF"],
  } = opts;

  const meta = await sharp(baseImage).metadata();
  const W = meta.width ?? 1024;
  const H = meta.height ?? 1024;

  const primaryColor = brandColors[0] ?? "#1a1a2e";
  const accentColor = brandColors[1] ?? "#3B82F6";
  const { r: pr, g: pg, b: pb } = hexToRgb(primaryColor);
  const { r: ar, g: ag, b: ab } = hexToRgb(accentColor);
  const textColor = contrastColor(primaryColor);

  switch (template) {
    case "text-left":
    case "split-dark": {
      // Metade esquerda: fundo escuro com texto (45% da largura)
      // Metade direita: imagem original (55%)
      const halfW = Math.round(W * 0.45);
      const headlineFontSize = Math.round(W * 0.040); // menor para caber
      const bodyFontSize = Math.round(W * 0.024);
      const companyFontSize = Math.round(W * 0.019);
      const pad = Math.round(W * 0.038);
      const textWidth = halfW - pad * 2;
      const maxCharsH = Math.floor(textWidth / (headlineFontSize * 0.60));
      const maxCharsB = Math.floor(textWidth / (bodyFontSize * 0.56));

      const headlineLines = headline ? wrapText(headline, maxCharsH) : [];
      const bodyLines = body ? wrapText(body, maxCharsB) : [];

      let svgText = "";
      let y = pad + headlineFontSize;

      // Accent bar
      svgText += `<rect x="${pad}" y="${pad - 8}" width="${Math.round(W * 0.025)}" height="${headlineFontSize * 0.8}" fill="rgb(${ar},${ag},${ab})" rx="2"/>`;

      // Headline
      for (const line of headlineLines) {
        const esc = line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        svgText += `<text x="${pad + Math.round(W * 0.035)}" y="${y}" font-size="${headlineFontSize}" font-weight="800" font-family="Arial Black, Arial, sans-serif" fill="${textColor}">${esc}</text>`;
        y += headlineFontSize * 1.25;
      }

      // Body
      if (bodyLines.length > 0) {
        y += pad * 0.4;
        for (const line of bodyLines) {
          const esc = line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
          svgText += `<text x="${pad}" y="${y}" font-size="${bodyFontSize}" font-weight="400" font-family="Arial, sans-serif" fill="${textColor}" opacity="0.85">${esc}</text>`;
          y += bodyFontSize * 1.4;
        }
      }

      // Company name no rodapé
      if (companyName) {
        const compY = H - pad;
        const esc = companyName.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        svgText += `<text x="${pad}" y="${compY}" font-size="${companyFontSize}" font-weight="700" font-family="Arial, sans-serif" fill="rgb(${ar},${ag},${ab})">${esc}</text>`;
      }

      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${halfW}" height="${H}">
        <rect width="${halfW}" height="${H}" fill="rgb(${pr},${pg},${pb})" opacity="0.95"/>
        <g clip-path="url(#clip)">
          <defs><clipPath id="clip"><rect x="${pad}" y="0" width="${textWidth + Math.round(W * 0.035)}" height="${H}"/></clipPath></defs>
          ${svgText}
        </g>
      </svg>`;

      return sharp(baseImage)
        .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
        .png()
        .toBuffer();
    }

    case "text-bottom":
    default:
      // Usa a função overlayText existente
      return overlayText(baseImage, {
        headline,
        body,
        companyName,
        brandColors,
        textPosition: template === "text-top" ? "top" : template === "text-center" ? "center" : "bottom",
      });
  }
}

// ---------------------------------------------------------------------------
// composeMarketingPost — overlay profissional com gradiente e hierarquia de texto
// ---------------------------------------------------------------------------

export interface MarketingPostOptions {
  /** Título principal em destaque */
  headline: string;
  /** Texto de corpo / descrição */
  body?: string;
  /** Nome da empresa exibido no rodapé */
  companyName?: string;
  /** Cores da marca [primary, accent, ...] */
  brandColors?: string[];
  /** Cor de destaque para o nome da empresa (sobrescreve brandColors[1]) */
  accentColor?: string;
}

/**
 * Quebra texto em linhas respeitando uma largura máxima em pixels.
 * Usa estimativa de largura por caractere baseada no tamanho da fonte.
 * Retorna no máximo `maxLines` linhas; a última é truncada com "…" se necessário.
 */
function _wrapTextPx(
  text: string,
  fontSizePx: number,
  maxWidthPx: number,
  maxLines: number,
): string[] {
  // Fator empírico: caractere médio ocupa ~0.56× o tamanho da fonte em Arial
  const charWidthEst = fontSizePx * 0.56;
  const maxChars = Math.max(1, Math.floor(maxWidthPx / charWidthEst));

  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      // Palavra maior que a linha inteira — força quebra
      if (word.length > maxChars) {
        let remaining = word;
        while (remaining.length > maxChars) {
          lines.push(remaining.slice(0, maxChars));
          remaining = remaining.slice(maxChars);
          if (lines.length >= maxLines) break;
        }
        current = remaining;
      } else {
        current = word;
      }
    }
    if (lines.length >= maxLines) break;
  }

  if (current && lines.length < maxLines) lines.push(current);

  // Trunca para maxLines e adiciona "…" na última se o texto foi cortado
  if (lines.length >= maxLines) {
    const last = lines[maxLines - 1];
    const allText = text.replace(/\s+/g, " ").trim();
    const coveredText = lines.slice(0, maxLines).join(" ");
    if (coveredText.length < allText.length && last) {
      lines[maxLines - 1] = last.length > 2 ? last.slice(0, -1) + "…" : last + "…";
    }
    return lines.slice(0, maxLines);
  }

  return lines;
}

/** Escapa caracteres especiais XML/SVG */
function escXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Compõe uma imagem de post de marketing profissional.
 *
 * - Gradiente escuro suave cobrindo ~60% inferior da imagem
 * - Hierarquia de texto: headline grande + corpo médio + nome da empresa
 * - Texto NUNCA ultrapassa as bordas — quebra de linha conservadora
 * - Retorna Buffer WebP
 */
export async function composeMarketingPost(
  baseImage: Buffer,
  opts: MarketingPostOptions,
): Promise<Buffer> {
  const {
    headline,
    body,
    companyName,
    brandColors = ["#1a1a2e", "#3B82F6", "#FFFFFF"],
    accentColor,
  } = opts;

  const meta = await sharp(baseImage).metadata();
  const W = meta.width ?? 1024;
  const H = meta.height ?? 1024;

  const primaryColor = brandColors[0] ?? "#1a1a2e";
  const resolvedAccent = accentColor ?? brandColors[1] ?? "#3B82F6";
  const { r: pr, g: pg, b: pb } = hexToRgb(primaryColor);
  const { r: ar, g: ag, b: ab } = hexToRgb(resolvedAccent);

  // Padding lateral generoso — 5% de cada lado
  const padX = Math.round(W * 0.05);
  const padBottom = Math.round(H * 0.04);
  const textWidth = W - padX * 2;

  // Tipografia proporcional — conservadora para não cortar
  const headlineFontSize = Math.round(W * 0.044);  // ~45px em 1024px
  const bodyFontSize     = Math.round(W * 0.026);  // ~27px em 1024px
  const companyFontSize  = Math.round(W * 0.019);  // ~19px em 1024px

  const headlineLineH = headlineFontSize * 1.3;
  const bodyLineH     = bodyFontSize * 1.45;

  // Fator de largura conservador: 0.65 para maiúsculas/acentuados
  // (Arial Bold maiúsculo é mais largo que 0.56)
  const headlineCharW = headlineFontSize * 0.65;
  const bodyCharW     = bodyFontSize * 0.58;

  const maxCharsHeadline = Math.max(1, Math.floor(textWidth / headlineCharW));
  const maxCharsBody     = Math.max(1, Math.floor(textWidth / bodyCharW));

  // Quebra de linha simples e confiável
  function wrap(text: string, maxChars: number, maxLines: number): string[] {
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      if (lines.length >= maxLines) break;
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length <= maxChars) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        // Palavra maior que a linha — trunca com hífen
        current = word.length > maxChars ? word.slice(0, maxChars - 1) + "-" : word;
      }
    }
    if (current && lines.length < maxLines) lines.push(current);
    // Adiciona "…" se o texto foi cortado
    if (lines.length >= maxLines) {
      const joined = lines.join(" ");
      if (joined.length < text.replace(/\s+/g, " ").trim().length) {
        const last = lines[maxLines - 1];
        lines[maxLines - 1] = (last ?? "").slice(0, -1) + "…";
      }
    }
    return lines.slice(0, maxLines);
  }

  const headlineLines = headline ? wrap(headline, maxCharsHeadline, 3) : [];
  const bodyLines     = body     ? wrap(body,     maxCharsBody,     3) : [];

  // Calcula altura total do bloco de texto
  const headlineBlockH = headlineLines.length * headlineLineH;
  const bodyBlockH     = bodyLines.length > 0 ? bodyLines.length * bodyLineH + headlineFontSize * 0.35 : 0;
  const companyBlockH  = companyName ? companyFontSize * 1.8 : 0;
  const totalTextH     = headlineBlockH + bodyBlockH + companyBlockH + padBottom * 1.5;

  // Garante que o bloco de texto não ultrapassa 50% da imagem
  const maxBlockH = Math.round(H * 0.50);
  const clampedTotalH = Math.min(totalTextH, maxBlockH);

  // Gradiente começa onde o bloco de texto começa (com margem extra)
  const gradientStartY = Math.max(0, H - clampedTotalH - Math.round(H * 0.08));

  // Posição Y do início do texto
  const textStartY = H - clampedTotalH + padBottom * 0.5;

  // Constrói SVG
  let svgElements = "";
  let curY = textStartY + headlineFontSize;

  for (const line of headlineLines) {
    svgElements += `<text x="${padX}" y="${curY}" font-size="${headlineFontSize}" font-weight="700" font-family="Arial, Helvetica, sans-serif" fill="#ffffff" letter-spacing="-0.3">${escXml(line)}</text>`;
    curY += headlineLineH;
  }

  if (bodyLines.length > 0) {
    curY += headlineFontSize * 0.35;
    for (const line of bodyLines) {
      svgElements += `<text x="${padX}" y="${curY}" font-size="${bodyFontSize}" font-weight="400" font-family="Arial, Helvetica, sans-serif" fill="#ffffff" opacity="0.88">${escXml(line)}</text>`;
      curY += bodyLineH;
    }
  }

  if (companyName) {
    const companyY = H - padBottom;
    svgElements += `<text x="${padX}" y="${companyY}" font-size="${companyFontSize}" font-weight="600" font-family="Arial, Helvetica, sans-serif" fill="rgb(${ar},${ag},${ab})">${escXml(companyName)}</text>`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>
      <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stop-color="rgb(${pr},${pg},${pb})" stop-opacity="0"/>
        <stop offset="60%"  stop-color="rgb(${pr},${pg},${pb})" stop-opacity="0.55"/>
        <stop offset="100%" stop-color="rgb(${pr},${pg},${pb})" stop-opacity="0.88"/>
      </linearGradient>
      <clipPath id="tc">
        <rect x="${padX}" y="0" width="${textWidth}" height="${H}"/>
      </clipPath>
    </defs>
    <rect x="0" y="${gradientStartY}" width="${W}" height="${H - gradientStartY}" fill="url(#grad)"/>
    <g clip-path="url(#tc)">${svgElements}</g>
  </svg>`;

  return sharp(baseImage)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .webp({ quality: 92 })
    .toBuffer();
}
