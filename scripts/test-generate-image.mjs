#!/usr/bin/env node
/**
 * Script standalone para testar geração de imagens com Flux + overlay de logo.
 *
 * Uso:
 *   node --env-file=.env scripts/test-generate-image.mjs [opções]
 *
 * Opções:
 *   --prompt "texto"           Prompt único. Se omitido, usa 3 variações padrão.
 *   --aspect 1:1 | 16:9 | ...  Aspect ratio (default: 1:1).
 *   --logo /caminho/para/logo.png   Logo para overlay (opcional).
 *   --out  ./test-outputs      Diretório de saída (default: test-outputs).
 *   --model owner/name         Modelo Replicate (default: black-forest-labs/flux-schnell).
 *
 * Env vars obrigatórias:
 *   REPLICATE_API_TOKEN
 */

import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { argv, exit } from "node:process";
import Replicate from "replicate";
import sharp from "sharp";

// --- arg parser simples ---
function parseArgs(args) {
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (!next || next.startsWith("--")) {
        out[key] = true;
      } else {
        out[key] = next;
        i++;
      }
    }
  }
  return out;
}

const args = parseArgs(argv.slice(2));

const MODEL = args.model || "black-forest-labs/flux-schnell";
const ASPECT = args.aspect || "1:1";
const OUT_DIR = resolve(args.out || "test-outputs");
const LOGO_PATH = args.logo ? resolve(args.logo) : null;

const DEFAULT_PROMPTS = [
  "Professional social media image, minimalist composition, lots of negative space, soft lighting, brand palette blue and white. No text, no watermark, no logo.",
  "Professional social media image, vibrant and eye-catching, geometric shapes, strong contrast, brand palette blue and white. No text, no watermark, no logo.",
  "Professional social media image, elegant and sophisticated, subtle gradients, editorial feel, brand palette blue and white. No text, no watermark, no logo.",
];

const PROMPTS = args.prompt
  ? [args.prompt, args.prompt, args.prompt]
  : DEFAULT_PROMPTS;

// --- checagens ---
if (!process.env.REPLICATE_API_TOKEN) {
  console.error("❌ REPLICATE_API_TOKEN não definido. Rode com: node --env-file=.env scripts/test-generate-image.mjs");
  exit(1);
}

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

// --- helpers ---
function extractFirstUrl(output) {
  if (typeof output === "string") return output;
  if (Array.isArray(output) && output.length > 0) return extractFirstUrl(output[0]);
  if (output && typeof output === "object" && typeof output.url === "function") {
    const u = output.url();
    return u instanceof URL ? u.toString() : u;
  }
  return null;
}

async function downloadBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} baixando ${url}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

async function overlayLogo(baseImage, logoBuffer, opts = {}) {
  const {
    widthRatio = 0.18,
    margin = 32,
    position = "bottom-right",
  } = opts;

  const gravityMap = {
    "bottom-right": "southeast",
    "bottom-left": "southwest",
    "top-right": "northeast",
    "top-left": "northwest",
    center: "center",
  };
  const gravity = gravityMap[position] || "southeast";

  const baseMeta = await sharp(baseImage).metadata();
  if (!baseMeta.width || !baseMeta.height) {
    throw new Error("Imagem base sem dimensões");
  }

  const targetLogoWidth = Math.max(32, Math.round(baseMeta.width * widthRatio));

  const resizedLogo = await sharp(logoBuffer)
    .resize({ width: targetLogoWidth, withoutEnlargement: false })
    .ensureAlpha()
    .png()
    .toBuffer();

  const logoMeta = await sharp(resizedLogo).metadata();
  const layerWidth = (logoMeta.width || targetLogoWidth) + margin * 2;
  const layerHeight = (logoMeta.height || targetLogoWidth) + margin * 2;

  const logoLayer = await sharp({
    create: {
      width: layerWidth,
      height: layerHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: resizedLogo, top: margin, left: margin }])
    .png()
    .toBuffer();

  return sharp(baseImage)
    .composite([{ input: logoLayer, gravity }])
    .webp({ quality: 90 })
    .toBuffer();
}

async function main() {
  console.log("🎨 Teste de geração de imagens");
  console.log("   Modelo:", MODEL);
  console.log("   Aspect ratio:", ASPECT);
  console.log("   Saída:", OUT_DIR);
  if (LOGO_PATH) console.log("   Logo:", LOGO_PATH);
  console.log();

  await mkdir(OUT_DIR, { recursive: true });

  const logoBuffer = LOGO_PATH ? await readFile(LOGO_PATH) : null;
  if (logoBuffer) {
    console.log(`   Logo carregada: ${(logoBuffer.length / 1024).toFixed(1)} KB`);
  }

  console.log(`\n📤 Enviando ${PROMPTS.length} gerações em paralelo para o Replicate...`);
  const started = Date.now();

  const runs = PROMPTS.map((prompt, index) =>
    replicate
      .run(MODEL, {
        input: {
          prompt,
          aspect_ratio: ASPECT,
          num_outputs: 1,
          output_format: "webp",
          output_quality: 90,
          go_fast: true,
        },
      })
      .then((output) => ({ index, prompt, output }))
      .catch((err) => ({ index, prompt, error: err })),
  );

  const results = await Promise.all(runs);
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`📥 Respostas recebidas em ${elapsed}s`);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  for (const r of results) {
    const label = `var${r.index + 1}`;
    if (r.error) {
      console.error(`  ❌ [${label}] falhou: ${r.error.message || r.error}`);
      continue;
    }

    const url = extractFirstUrl(r.output);
    if (!url) {
      console.error(`  ❌ [${label}] sem URL no output`);
      continue;
    }

    console.log(`  ⬇️  [${label}] baixando ${url}`);
    let bytes;
    try {
      bytes = await downloadBuffer(url);
    } catch (err) {
      console.error(`  ❌ [${label}] download falhou: ${err.message}`);
      continue;
    }

    const rawPath = join(OUT_DIR, `${timestamp}_${label}_raw.webp`);
    await writeFile(rawPath, bytes);
    console.log(`  💾 [${label}] salvo: ${rawPath} (${(bytes.length / 1024).toFixed(1)} KB)`);

    if (logoBuffer) {
      try {
        const composed = await overlayLogo(bytes, logoBuffer);
        const composedPath = join(OUT_DIR, `${timestamp}_${label}_with-logo.webp`);
        await writeFile(composedPath, composed);
        console.log(`  🎯 [${label}] com logo: ${composedPath} (${(composed.length / 1024).toFixed(1)} KB)`);
      } catch (err) {
        console.error(`  ❌ [${label}] overlay falhou: ${err.message}`);
      }
    }
  }

  console.log(`\n✅ Pronto. Abra os arquivos em: ${OUT_DIR}`);
}

main().catch((err) => {
  console.error("💥 Erro fatal:", err);
  exit(1);
});
