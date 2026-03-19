import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const [projectCount, partnerCount, activePartnerCount] = await Promise.all([
    prisma.project.count(),
    prisma.partner.count(),
    prisma.partner.count({ where: { isActive: true } }),
  ]);

  const activeProjects = await prisma.project.count({
    where: { salesStatus: { in: ["営業中", "受注済"] } },
  });

  const cards = [
    {
      label: "案件数",
      value: projectCount,
      sub: `${activeProjects}件 進行中`,
      href: "/admin/projects",
      color: "bg-blue-50 text-blue-700 border-blue-200",
    },
    {
      label: "協力会社",
      value: partnerCount,
      sub: `${activePartnerCount}件 配信中`,
      href: "/admin/partners",
      color: "bg-green-50 text-green-700 border-green-200",
    },
    {
      label: "見積依頼",
      value: "—",
      sub: "Phase1で実装",
      href: "#",
      color: "bg-orange-50 text-orange-700 border-orange-200",
    },
    {
      label: "提出済",
      value: "—",
      sub: "Phase1で実装",
      href: "#",
      color: "bg-purple-50 text-purple-700 border-purple-200",
    },
  ];

  const recentProjects = await prisma.project.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      code: true,
      nameInternal: true,
      branch: true,
      salesStatus: true,
      salesManager: true,
    },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold">ダッシュボード</h1>
      <p className="mt-1 text-muted-foreground">
        見積徴収管理システムの概要です。
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className={`rounded-lg border p-6 transition-shadow hover:shadow-md ${card.color}`}
          >
            <p className="text-sm font-medium opacity-80">{card.label}</p>
            <p className="mt-1 text-3xl font-bold">{card.value}</p>
            <p className="mt-1 text-xs opacity-70">{card.sub}</p>
          </Link>
        ))}
      </div>

      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">最近の案件</h2>
          <Link
            href="/admin/projects"
            className="text-sm text-primary hover:underline"
          >
            すべて表示 →
          </Link>
        </div>
        <div className="mt-3 overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">案件No</th>
                <th className="px-4 py-3 text-left font-medium">案件名</th>
                <th className="px-4 py-3 text-left font-medium">拠点</th>
                <th className="px-4 py-3 text-left font-medium">営業担当</th>
                <th className="px-4 py-3 text-left font-medium">状況</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {recentProjects.map((p) => (
                <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs">{p.code}</td>
                  <td className="px-4 py-3">{p.nameInternal}</td>
                  <td className="px-4 py-3">{p.branch ?? "—"}</td>
                  <td className="px-4 py-3">{p.salesManager ?? "—"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={p.salesStatus} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
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
      {status ?? "不明"}
    </span>
  );
}
