import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{
    page?: string;
    q?: string;
    status?: string;
    branch?: string;
  }>;
}

const PAGE_SIZE = 20;
const BRANCH_OPTIONS = ["すべて", "東京本店", "大阪本店"];

export default async function ProjectsPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10));
  const q = params.q ?? "";
  const statusFilter = params.status ?? "";
  const branchFilter = params.branch ?? "";

  const where: Prisma.ProjectWhereInput = {};

  if (q) {
    where.OR = [
      { nameInternal: { contains: q, mode: "insensitive" } },
      { namePublic: { contains: q, mode: "insensitive" } },
      { code: { contains: q } },
      { address: { contains: q, mode: "insensitive" } },
    ];
  }

  if (statusFilter) {
    where.salesStatus = statusFilter;
  }

  if (branchFilter && branchFilter !== "すべて") {
    where.branch = branchFilter;
  }

  const statusOptions = await prisma.project.groupBy({
    by: ["salesStatus"],
    _count: true,
    orderBy: { _count: { salesStatus: "desc" } },
  });

  const [projects, totalCount] = await Promise.all([
    prisma.project.findMany({
      where,
      orderBy: { code: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        code: true,
        nameInternal: true,
        namePublic: true,
        branch: true,
        salesManager: true,
        salesStatus: true,
        buildingType: true,
        structure: true,
        address: true,
        startDate: true,
        endDate: true,
        contractAmount: true,
      },
    }),
    prisma.project.count({ where }),
  ]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  function buildUrl(overrides: Record<string, string>) {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (statusFilter) p.set("status", statusFilter);
    if (branchFilter) p.set("branch", branchFilter);
    p.set("page", String(page));
    for (const [k, v] of Object.entries(overrides)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    return `/admin/projects?${p.toString()}`;
  }

  function formatDate(d: Date | null): string {
    if (!d) return "—";
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  function formatAmount(amount: number | null): string {
    if (amount === null) return "—";
    return `${(amount / 1000).toLocaleString("ja-JP")}千円`;
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">案件管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            全{totalCount}件の案件
          </p>
        </div>
        <button className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90">
          + 新規案件
        </button>
      </div>

      {/* Filters */}
      <form className="mt-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="案件名・案件No・住所で検索..."
          className="h-9 w-64 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <select
          name="status"
          defaultValue={statusFilter || ""}
          className="h-9 rounded-md border bg-background px-3 text-sm"
        >
          <option value="">状況：すべて</option>
          {statusOptions.map((s) => (
            <option key={s.salesStatus ?? "null"} value={s.salesStatus ?? ""}>
              {s.salesStatus ?? "不明"} ({s._count})
            </option>
          ))}
        </select>
        <select
          name="branch"
          defaultValue={branchFilter || "すべて"}
          className="h-9 rounded-md border bg-background px-3 text-sm"
        >
          {BRANCH_OPTIONS.map((b) => (
            <option key={b} value={b}>
              {b === "すべて" ? "拠点：すべて" : b}
            </option>
          ))}
        </select>
        <input type="hidden" name="page" value="1" />
        <button
          type="submit"
          className="h-9 rounded-md bg-secondary px-4 text-sm font-medium hover:bg-secondary/80"
        >
          検索
        </button>
        {(q || statusFilter || branchFilter) && (
          <Link
            href="/admin/projects"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            リセット
          </Link>
        )}
      </form>

      {/* Table */}
      <div className="mt-4 overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="whitespace-nowrap px-4 py-3 font-medium">案件No</th>
              <th className="whitespace-nowrap px-4 py-3 font-medium">案件名（社内用）</th>
              <th className="whitespace-nowrap px-4 py-3 font-medium">拠点</th>
              <th className="whitespace-nowrap px-4 py-3 font-medium">営業担当</th>
              <th className="whitespace-nowrap px-4 py-3 font-medium">状況</th>
              <th className="whitespace-nowrap px-4 py-3 font-medium">用途</th>
              <th className="whitespace-nowrap px-4 py-3 font-medium">構造</th>
              <th className="whitespace-nowrap px-4 py-3 font-medium">工期</th>
              <th className="whitespace-nowrap px-4 py-3 font-medium text-right">請負金額</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {projects.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                  該当する案件が見つかりません
                </td>
              </tr>
            ) : (
              projects.map((p) => (
                <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">
                    <Link href={`/admin/projects/${p.id}`} className="text-primary hover:underline">
                      {p.code}
                    </Link>
                  </td>
                  <td className="max-w-[300px] truncate px-4 py-3" title={p.nameInternal}>
                    {p.nameInternal}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs">{p.branch ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs">{p.salesManager ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <StatusBadge status={p.salesStatus} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs">{p.buildingType ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs">{p.structure ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs">
                    {formatDate(p.startDate)} 〜 {formatDate(p.endDate)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-xs">
                    {formatAmount(p.contractAmount)}
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
            {(page - 1) * PAGE_SIZE + 1}〜{Math.min(page * PAGE_SIZE, totalCount)}件 / 全{totalCount}件
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
  );
}

function StatusBadge({ status }: { status: string | null }) {
  const s = status ?? "";
  let cls = "bg-gray-100 text-gray-800";
  if (s.includes("営業中")) cls = "bg-yellow-100 text-yellow-800";
  else if (s.includes("受注")) cls = "bg-blue-100 text-blue-800";
  else if (s.includes("完了")) cls = "bg-green-100 text-green-800";
  else if (s.includes("中止")) cls = "bg-red-100 text-red-800";
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status ?? "—"}
    </span>
  );
}
