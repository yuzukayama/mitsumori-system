import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ProjectDetailPage({ params }: Props) {
  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });

  if (!project) notFound();

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
    { label: "営業状況", value: project.salesStatus },
    { label: "用途", value: project.buildingType },
    { label: "構造", value: project.structure },
    {
      label: "延床面積",
      value: project.totalArea ? `${project.totalArea}㎡` : null,
    },
    { label: "請負金額", value: formatAmount(project.contractAmount) },
    { label: "住所", value: project.address },
    {
      label: "工期",
      value: `${formatDate(project.startDate)} 〜 ${formatDate(project.endDate)}`,
    },
  ];

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/admin/projects"
          className="rounded border px-3 py-1.5 text-xs hover:bg-muted"
        >
          ← 案件一覧
        </Link>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{project.nameInternal}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {project.namePublic}
          </p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-sm font-medium ${statusCls}`}
        >
          {project.salesStatus ?? "不明"}
        </span>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Basic Info */}
        <div className="rounded-lg border p-6">
          <h2 className="mb-4 text-lg font-semibold">基本情報</h2>
          <dl className="space-y-3">
            {fields.map((f) => (
              <div key={f.label} className="flex gap-4">
                <dt className="w-32 shrink-0 text-sm text-muted-foreground">
                  {f.label}
                </dt>
                <dd className="text-sm">{f.value ?? "—"}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Trade Types */}
        <div className="space-y-6">
          <div className="rounded-lg border p-6">
            <h2 className="mb-4 text-lg font-semibold">
              工種（{project.tradeTypes.length}種）
            </h2>
            {project.tradeTypes.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {project.tradeTypes.map((t) => (
                  <span
                    key={t}
                    className="rounded-md bg-muted px-2.5 py-1 text-xs"
                  >
                    {t}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                工種が設定されていません
              </p>
            )}
          </div>

          {/* Future: Estimate Requests */}
          <div className="rounded-lg border border-dashed p-6">
            <h2 className="mb-2 text-lg font-semibold text-muted-foreground">
              見積依頼
            </h2>
            <p className="text-sm text-muted-foreground">
              この案件の見積依頼はPhase1で実装予定です。
            </p>
            <button
              disabled
              className="mt-4 rounded-lg bg-primary/50 px-4 py-2 text-sm text-primary-foreground"
            >
              + 見積依頼を作成
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
