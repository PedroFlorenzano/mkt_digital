import { unlinkSync, existsSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

const dbPath = join(process.cwd(), "prisma", "dev.db");

if (existsSync(dbPath)) {
  unlinkSync(dbPath);
  console.log("Banco removido:", dbPath);
}

console.log("Recriando banco...");
execSync("npx prisma db push", { stdio: "inherit" });

console.log("Executando seed...");
execSync("npx tsx prisma/seed.ts", { stdio: "inherit" });

console.log("Reset completo!");
