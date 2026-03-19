import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { RequestForm } from "./form";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ trade?: string }>;
}

export default async function NewRequestPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { trade } = await searchParams;

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) notFound();

  const tradeTypes = project.tradeTypes;

  const selectedTrade = trade ?? tradeTypes[0] ?? "";

  let partners: { id: string; name: string; contactName: string | null; email: string; tradeTypes: string[] }[] = [];
  if (selectedTrade) {
    partners = await prisma.partner.findMany({
      where: {
        isActive: true,
        tradeTypes: { has: selectedTrade },
      },
      select: {
        id: true,
        name: true,
        contactName: true,
        email: true,
        tradeTypes: true,
      },
      orderBy: { name: "asc" },
    });
  }

  const existingRequests = await prisma.estimateRequest.findMany({
    where: { projectId: id, tradeType: selectedTrade },
    select: { partnerId: true },
  });
  const alreadyRequestedIds = new Set(existingRequests.map((r) => r.partnerId));

  return (
    <div>
      <div className="mb-6">
        <a
          href={`/admin/projects/${id}`}
          className="rounded border px-3 py-1.5 text-xs hover:bg-muted"
        >
          ← {project.nameInternal}
        </a>
      </div>

      <h1 className="text-2xl font-bold">見積依頼を作成</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {project.namePublic}（{project.code}）
      </p>

      {/* Trade Type Selection */}
      <div className="mt-6">
        <h2 className="text-sm font-medium">工種を選択</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {tradeTypes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              この案件に工種が設定されていません
            </p>
          ) : (
            tradeTypes.map((t) => (
              <a
                key={t}
                href={`/admin/projects/${id}/requests/new?trade=${encodeURIComponent(t)}`}
                className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                  t === selectedTrade
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                }`}
              >
                {t}
              </a>
            ))
          )}
        </div>
      </div>

      {selectedTrade && (
        <RequestForm
          projectId={id}
          tradeType={selectedTrade}
          partners={partners}
          alreadyRequestedIds={[...alreadyRequestedIds]}
        />
      )}
    </div>
  );
}
