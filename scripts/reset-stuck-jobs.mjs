import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const r = await p.videoJob.updateMany({
  where: { status: { in: ["queued", "extracting_frames", "generating_script", "transforming_frames", "generating_narration", "assembling"] } },
  data: { status: "error", errorMessage: "Job resetado — pipeline não iniciou. Por favor, crie um novo vídeo." }
});
console.log(`Reset ${r.count} job(s).`);
await p.$disconnect();
