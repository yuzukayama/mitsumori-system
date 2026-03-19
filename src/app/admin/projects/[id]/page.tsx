import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { CopyButton } from "./copy-button";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ProjectDetailPage({ params }: Props) {
  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) notFound();

  const requests = await prisma.estimateRequest.findMany({
    where: { projectId: id },
    include: { partner: { select: { name: true, email: true } } },
    orderBy: [{ tradeType: "asc" }, { createdAt: "desc" }],
  });

  const groupedRequests = requests.reduce(
    (acc, r) => {
      if (!acc[r.tradeType]) acc[r.tradeType] = [];
      acc[r.tradeType].push(r);
      return acc;
    },
    {} as Record<string, typeof requests>
  );

  function formatDate(d: Date | null): string {
    if (!d) return "未定";
    return `${d.getFullYear()}年${d.getMonth() + 1}月`;
  }

  function formatAmount(amount: number | null): string {
    if (amount === null) return "—";
    return `¥${amount.toLocaleString("ja-JP")}千`;
  }

  const s = project.salesStatus ?? "";
  let statusCls = "bg-gray-100 text-gray-700";
  if (s.includes("営業中")) statusCls = "bg-yellow-100 text-yellow-800 border-yellow-300";
  else if (s.includes("受注")) statusCls = "bg-blue-100 text-blue-800 border-blue-300";
  else if (s.includes("完了")) statusCls = "bg-green-100 text-green-800 border-green-300";
  else if (s.includes("中止")) statusCls = "bg-red-100 text-red-800 border-red-300";

  const fields = [
    { label: "案件No", value: project.code },
    { label: "案件名（社内用）", value: project.nameInternal },
    { label: "案件名（公開用）", value: project.namePublic },
    { label: "拠点", value: project.branch },
    { label: "営業担当", value: project.salesManager },
    { label: "用途", value: project.buildingType },
    { label: "構造", value: project.structure },
    { label: "延床面積", value: project.totalArea ? `${project.totalArea}㎡` : null },
    { label: "請負金額", value: formatAmount(project.contractAmount) },
    { label: "住所", value: project.address },
    { label: "工期", value: `${formatDate(project.startDate)} 〜 ${formatDate(project.endDate)}` },
  ];

  const baseUrl = process.env.NEXTAUTH_URL || process.env.APP_URL || "http://localhost:3000";

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Link href="/admin/projects" className="rounded border px-3 py-1.5 text-xs hover:bg-muted">
          ← 案件一覧
        </Link>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{project.nameInternal}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{project.namePublic}</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-sm font-medium ${statusCls}`}>
          {project.salesStatus ?? "不明"}
        </span>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border p-6">
          <h2 className="mb-4 text-lg font-semibold">基本情報</h2>
          <dl className="space-y-3">
            {fields.map((f) => (
              <div key={f.label} className="flex gap-4">
                <dt className="w-32 shrink-0 text-sm text-muted-foreground">{f.label}</dt>
                <dd className="text-sm">{f.value ?? "—"}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="rounded-lg border p-6">
          <h2 className="mb-4 text-lg font-semibold">工種（{project.tradeTypes.length}種）</h2>
          {project.tradeTypes.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {project.tradeTypes.map((t) => (
                <span key={t} className="rounded-md bg-muted px-2.5 py-1 text-xs">{t}</span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">工種が設定されていません</p>
          )}
        </div>
      </div>

      {/* Estimate Requests */}
      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">見積依頼（{requests.length}件）</h2>
          <Link
            href={`/admin/projects/${id}/requests/new`}
            className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
          >
            + 見積依頼を作成
          </Link>
        </div>

        {requests.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            まだ見積依頼がありません。「見積依頼を作成」から工種と協力会社を選んで依頼を送信できます。
          </div>
        ) : (
          <div className="mt-4 space-y-6">
            {Object.entries(groupedRequests).map(([trade, reqs]) => (
              <div key={trade}>
                <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                  {trade}（{reqs.length}社）
                </h3>
                <div className="overflow-hidden rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium">協力会社</th>
                        <th className="px-4 py-2 text-left font-medium">ステータス</th>
                        <th className="px-4 py-2 text-left font-medium">期限</th>
                        <th className="px-4 py-2 text-right font-medium">提出金額</th>
                        <th className="px-4 py-2 text-left font-medium">ポータルURL</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {reqs.map((r) => (
                        <tr key={r.id} className="hover:bg-muted/30">
                          <td className="px-4 py-2">
                            <div className="font-medium">{r.partner.name}</div>
                            <div className="text-[10px] text-muted-foreground">{r.partner.email}</div>
                          </td>
                          <td className="px-4 py-2">
                            <RequestStatusBadge status={r.status} />
                          </td>
                          <td className="px-4 py-2 text-xs">
                            {r.deadline
                              ? `${r.deadline.getFullYear()}/${String(r.deadline.getMonth() + 1).padStart(2, "0")}/${String(r.deadline.getDate()).padStart(2, "0")}`
                              : "—"}
                          </td>
                          <td className="px-4 py-2 text-right text-xs font-medium">
                            {r.totalAmount !== null
                              ? `¥${r.totalAmount.toLocaleString("ja-JP")}`
                              : "—"}
                          </td>
                          <td className="px-4 py-2">
                            <CopyButton url={`${baseUrl}/portal/${r.token}`} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RequestStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    DRAFT: "bg-gray-100 text-gray-700",
    REQUESTED: "bg-blue-100 text-blue-700",
    IN_PROGRESS: "bg-yellow-100 text-yellow-700",
    SUBMITTED: "bg-green-100 text-green-700",
    CONFIRMED: "bg-emerald-100 text-emerald-700",
    REJECTED: "bg-red-100 text-red-700",
    RETURNED: "bg-orange-100 text-orange-700",
  };
  const labels: Record<string, string> = {
    DRAFT: "下書き",
    REQUESTED: "依頼中",
    IN_PROGRESS: "入力中",
    SUBMITTED: "提出済",
    CONFIRMED: "確認済",
    REJECTED: "不採用",
    RETURNED: "差し戻し",
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${styles[status] ?? "bg-gray-100"}`}>
      {labels[status] ?? status}
    </span>
  );
}
