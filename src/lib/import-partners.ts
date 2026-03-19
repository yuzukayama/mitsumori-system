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

async function main() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
  });
  const prisma = new PrismaClient({ adapter });

  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error("Usage: npx tsx src/lib/import-partners.ts <csv-file-path>");
    process.exit(1);
  }

  const content = readFileSync(csvPath, "utf-8");
  const lines = content.split("\n").filter((l) => l.trim());
  const header = parseCsvLine(lines[0]);
  console.log("Header columns:", header);
  console.log("Data rows:", lines.length - 1);

  const colIndex = (name: string) => header.indexOf(name);

  let imported = 0;
  let skipped = 0;
  const batchSize = 10;

  for (let i = 1; i < lines.length; i += batchSize) {
    const batch = lines.slice(i, i + batchSize);
    const operations = batch.map((line) => {
      const cols = parseCsvLine(line);
      const indexId = parseInt(cols[colIndex("会社ID")], 10);
      const partnerCode = cols[colIndex("協力会社コード")]?.trim() || null;
      const name = cols[colIndex("会社名")];
      const tradeTypesRaw = cols[colIndex("工種")] || "";
      const areasRaw = cols[colIndex("エリア")] || "";
      const ndaStatus = parseInt(cols[colIndex("NDA同意")] || "0", 10);
      const isActive = cols[colIndex("配信状況")] === "配信する";
      const contactName = cols[colIndex("担当者")] || null;
      const phone = cols[colIndex("電話番号")] || null;
      const postalCode = cols[colIndex("郵便番号")] || null;
      const address = cols[colIndex("住所")] || null;
      const email = cols[colIndex("メールアドレス1")] || "";
      const email2 = cols[colIndex("メールアドレス2")] || null;

      const tradeTypes = tradeTypesRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const areas = areasRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      if (!name || !email) {
        skipped++;
        return null;
      }

      return prisma.partner.upsert({
        where: { indexId },
        update: {
          partnerCode,
          name,
          contactName,
          email,
          email2: email2 || undefined,
          phone,
          postalCode,
          address,
          tradeTypes,
          areas,
          ndaStatus,
          isActive,
        },
        create: {
          indexId,
          partnerCode,
          name,
          contactName,
          email,
          email2: email2 || undefined,
          phone,
          postalCode,
          address,
          tradeTypes,
          areas,
          ndaStatus,
          isActive,
        },
      });
    });

    const validOps = operations.filter(Boolean);
    for (const op of validOps) {
      try {
        await op;
        imported++;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("Unique constraint")) {
          skipped++;
        } else {
          console.error("\nError:", msg);
          skipped++;
        }
      }
    }
    process.stdout.write(`\r  Imported: ${imported} / ${lines.length - 1}`);
  }

  console.log(`\n\nImport complete!`);
  console.log(`  Imported: ${imported}`);
  console.log(`  Skipped:  ${skipped}`);

  const count = await prisma.partner.count();
  console.log(`  Total partners in DB: ${count}`);

  await prisma.$disconnect();
}

main().catch(console.error);
