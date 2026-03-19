import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { readFileSync } from "fs";

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function parseYYYYMM(val: string): Date | null {
  if (!val || val.startsWith("9999")) return null;
  const y = parseInt(val.substring(0, 4), 10);
  const m = parseInt(val.substring(4, 6), 10);
  if (isNaN(y) || isNaN(m)) return null;
  return new Date(y, m - 1, 1);
}

async function main() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
  });
  const prisma = new PrismaClient({ adapter });

  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error("Usage: npx tsx src/lib/import-projects.ts <csv-file-path>");
    process.exit(1);
  }

  const content = readFileSync(csvPath, "utf-8");
  const lines = content.split("\n").filter((l) => l.trim());
  const header = parseCsvLine(lines[0]);
  console.log("Header columns:", header);
  console.log("Data rows:", lines.length - 1);

  const col = (name: string) => header.indexOf(name);

  let imported = 0;
  let skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const code = cols[col("案件No")]?.trim();
    const nameInternal = cols[col("案件名（社内用）")]?.trim() || "";
    const namePublic = cols[col("案件名（公開用）")]?.trim() || "";
    const branch = cols[col("拠点")]?.trim() || null;
    const salesManager = cols[col("営業担当")]?.trim() || null;
    const salesStatus = cols[col("営業状況")]?.trim() || null;
    const startDate = parseYYYYMM(cols[col("工事期間FROM")]);
    const endDate = parseYYYYMM(cols[col("工事期間TO")]);
    const buildingType = cols[col("用途")]?.trim() || null;
    const structure = cols[col("構造")]?.trim() || null;
    const areaRaw = cols[col("のべ面積")]?.trim();
    const totalArea = areaRaw ? parseFloat(areaRaw) : null;
    const amountRaw = cols[col("請負金額")]?.trim();
    const contractAmount = amountRaw ? parseInt(amountRaw, 10) : null;
    const prefecture = cols[col("エリア")]?.trim() || null;
    const city = cols[col("住所")]?.trim() || null;
    const address = [prefecture, city].filter(Boolean).join(" ");
    const tradeTypesRaw = cols[col("工種")]?.trim() || "";
    const tradeTypes = tradeTypesRaw
      .split("/")
      .map((s) => s.trim())
      .filter(Boolean);

    if (!code || !nameInternal) {
      skipped++;
      continue;
    }

    try {
      await prisma.project.upsert({
        where: { code },
        update: {
          nameInternal,
          namePublic,
          branch,
          salesManager,
          salesStatus,
          structure,
          contractAmount: isNaN(contractAmount ?? NaN) ? null : contractAmount,
          tradeTypes,
          startDate,
          endDate,
          totalArea,
          buildingType,
          address: address || null,
        },
        create: {
          code,
          nameInternal,
          namePublic,
          branch,
          salesManager,
          salesStatus,
          structure,
          contractAmount: isNaN(contractAmount ?? NaN) ? null : contractAmount,
          tradeTypes,
          startDate,
          endDate,
          totalArea,
          buildingType,
          address: address || null,
        },
      });
      imported++;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`\nRow ${i} (code=${code}): ${msg}`);
      skipped++;
    }

    if (i % 10 === 0 || i === lines.length - 1) {
      process.stdout.write(`\r  Imported: ${imported} / ${lines.length - 1}`);
    }
  }

  console.log(`\n\nImport complete!`);
  console.log(`  Imported: ${imported}`);
  console.log(`  Skipped:  ${skipped}`);

  const count = await prisma.project.count();
  console.log(`  Total projects in DB: ${count}`);

  await prisma.$disconnect();
}

main().catch(console.error);
