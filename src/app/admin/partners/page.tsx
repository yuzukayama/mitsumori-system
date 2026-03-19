import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{
    page?: string;
    q?: string;
    active?: string;
    trade?: string;
  }>;
}

const PAGE_SIZE = 20;

export default async function PartnersPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10));
  const q = params.q ?? "";
  const activeFilter = params.active ?? "";
  const tradeFilter = params.trade ?? "";

  const where: Prisma.PartnerWhereInput = {};

  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { contactName: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { partnerCode: { contains: q } },
      { address: { contains: q, mode: "insensitive" } },
    ];
  }

  if (activeFilter === "active") {
    where.isActive = true;
  } else if (activeFilter === "inactive") {
    where.isActive = false;
  }

  if (tradeFilter) {
    where.tradeTypes = { has: tradeFilter };
  }

  const [partners, totalCount] = await Promise.all([
    prisma.partner.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        partnerCode: true,
        name: true,
        contactName: true,
        email: true,
        phone: true,
        address: true,
        tradeTypes: true,
        areas: true,
        isActive: true,
        ndaStatus: true,
      },
    }),
    prisma.partner.count({ where }),
  ]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const tradeTypeCounts = await prisma.$queryRaw<
    { trade: string; count: bigint }[]
  >`
    SELECT unnest("tradeTypes") as trade, COUNT(*) as count
    FROM "Partner"
    GROUP BY trade
    ORDER BY count DESC
    LIMIT 15
  `;

  function buildUrl(overrides: Record<string, string>) {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (activeFilter) p.set("active", activeFilter);
    if (tradeFilter) p.set("trade", tradeFilter);
    p.set("page", String(page));
    for (const [k, v] of Object.entries(overrides)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    return `/admin/partners?${p.toString()}`;
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">協力会社</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            全{totalCount}社
          </p>
        </div>
        <div className="flex gap-2">
          <button className="rounded-lg border px-4 py-2 text-sm hover:bg-accent">
            CSVインポート
          </button>
          <button className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90">
            + 新規登録
          </button>
        </div>
      </div>

      {/* Filters */}
      <form className="mt-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="会社名・担当者・メール・住所で検索..."
          className="h-9 w-72 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <select
          name="active"
          defaultValue={activeFilter || ""}
          className="h-9 rounded-md border bg-background px-3 text-sm"
        >
          <option value="">配信状況：すべて</option>
          <option value="active">配信する</option>
          <option value="inactive">配信しない</option>
        </select>
        <input type="hidden" name="page" value="1" />
        {tradeFilter && <input type="hidden" name="trade" value={tradeFilter} />}
        <button
          type="submit"
          className="h-9 rounded-md bg-secondary px-4 text-sm font-medium hover:bg-secondary/80"
        >
          検索
        </button>
        {(q || activeFilter || tradeFilter) && (
          <Link
            href="/admin/partners"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            リセット
          </Link>
        )}
      </form>

      <div className="mt-4 flex gap-6">
        {/* Main Table */}
        <div className="flex-1 overflow-x-auto">
          <div className="rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">会社名</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">担当者</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">メール</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">電話</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">住所</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">工種</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium text-center">NDA</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium text-center">配信</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {partners.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                      該当する協力会社が見つかりません
                    </td>
                  </tr>
                ) : (
                  partners.map((p) => (
                    <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                      <td className="max-w-[200px] truncate px-4 py-3 font-medium" title={p.name}>
                        <Link href={`/admin/partners/${p.id}`} className="text-primary hover:underline">
                          {p.name}
                        </Link>
                        {p.partnerCode && (
                          <span className="ml-1 text-[10px] text-muted-foreground">
                            ({p.partnerCode})
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs">{p.contactName ?? "—"}</td>
                      <td className="max-w-[180px] truncate px-4 py-3 text-xs" title={p.email}>
                        {p.email}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs">{p.phone ?? "—"}</td>
                      <td className="max-w-[120px] truncate px-4 py-3 text-xs" title={p.address ?? ""}>
                        {p.address ?? "—"}
                      </td>
                      <td className="max-w-[200px] px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {p.tradeTypes.slice(0, 3).map((t) => (
                            <span
                              key={t}
                              className="inline-block rounded bg-muted px-1.5 py-0.5 text-[10px]"
                            >
                              {t}
                            </span>
                          ))}
                          {p.tradeTypes.length > 3 && (
                            <span className="text-[10px] text-muted-foreground">
                              +{p.tradeTypes.length - 3}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {p.ndaStatus === 1 ? (
                          <span className="inline-block h-5 w-5 rounded-full bg-green-100 text-center text-xs leading-5 text-green-700">
                            ✓
                          </span>
                        ) : (
                          <span className="inline-block h-5 w-5 rounded-full bg-gray-100 text-center text-xs leading-5 text-gray-400">
                            —
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            p.isActive
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {p.isActive ? "配信中" : "停止"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {(page - 1) * PAGE_SIZE + 1}〜{Math.min(page * PAGE_SIZE, totalCount)}社 / 全{totalCount}社
              </p>
              <div className="flex gap-1">
                {page > 1 && (
                  <Link
                    href={buildUrl({ page: String(page - 1) })}
                    className="rounded border px-3 py-1.5 text-xs hover:bg-muted"
                  >
                    ← 前へ
                  </Link>
                )}
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  let p: number;
                  if (totalPages <= 7) {
                    p = i + 1;
                  } else if (page <= 4) {
                    p = i + 1;
                  } else if (page >= totalPages - 3) {
                    p = totalPages - 6 + i;
                  } else {
                    p = page - 3 + i;
                  }
                  return (
                    <Link
                      key={p}
                      href={buildUrl({ page: String(p) })}
                      className={`rounded border px-3 py-1.5 text-xs ${
                        p === page
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-muted"
                      }`}
                    >
                      {p}
                    </Link>
                  );
                })}
                {page < totalPages && (
                  <Link
                    href={buildUrl({ page: String(page + 1) })}
                    className="rounded border px-3 py-1.5 text-xs hover:bg-muted"
                  >
                    次へ →
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar: Trade Types */}
        <div className="hidden w-56 shrink-0 lg:block">
          <div className="rounded-lg border p-4">
            <h3 className="text-sm font-medium">工種で絞り込み</h3>
            <div className="mt-3 space-y-1">
              {tradeTypeCounts.map((t) => (
                <Link
                  key={t.trade}
                  href={buildUrl({ trade: t.trade === tradeFilter ? "" : t.trade, page: "1" })}
                  className={`flex items-center justify-between rounded px-2 py-1 text-xs transition-colors ${
                    t.trade === tradeFilter
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted"
                  }`}
                >
                  <span className="truncate">{t.trade}</span>
                  <span className="ml-2 shrink-0 opacity-70">{Number(t.count)}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
