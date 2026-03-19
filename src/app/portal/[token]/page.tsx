import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { SubmitForm } from "./submit-form";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ token: string }>;
}

export default async function PortalPage({ params }: Props) {
  const { token } = await params;

  const request = await prisma.estimateRequest.findUnique({
    where: { token },
    include: {
      project: {
        select: {
          namePublic: true,
          code: true,
          buildingType: true,
          structure: true,
          address: true,
        },
      },
      partner: {
        select: { name: true, contactName: true },
      },
    },
  });

  if (!request) notFound();

  const isExpired = request.tokenExpiresAt < new Date();
  const isSubmitted = request.status === "SUBMITTED" || request.status === "CONFIRMED";

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <header className="border-b bg-white">
        <div className="mx-auto max-w-3xl px-6 py-4">
          <h1 className="text-lg font-bold text-slate-900">見積入力ポータル</h1>
          <p className="text-xs text-slate-500">三和建設株式会社</p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        {/* Partner info */}
        <div className="rounded-lg border bg-white p-6">
          <p className="text-sm text-slate-500">回答企業</p>
          <p className="text-lg font-bold">{request.partner.name}</p>
          {request.partner.contactName && (
            <p className="text-sm text-slate-500">{request.partner.contactName} 様</p>
          )}
        </div>

        {/* Project info */}
        <div className="mt-4 rounded-lg border bg-white p-6">
          <h2 className="mb-3 text-sm font-medium text-slate-500">案件情報</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex gap-4">
              <dt className="w-24 shrink-0 text-slate-500">案件名</dt>
              <dd className="font-medium">{request.project.namePublic}</dd>
            </div>
            <div className="flex gap-4">
              <dt className="w-24 shrink-0 text-slate-500">案件No</dt>
              <dd className="font-mono text-xs">{request.project.code}</dd>
            </div>
            <div className="flex gap-4">
              <dt className="w-24 shrink-0 text-slate-500">工種</dt>
              <dd>
                <span className="rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                  {request.tradeType}
                </span>
              </dd>
            </div>
            {request.project.buildingType && (
              <div className="flex gap-4">
                <dt className="w-24 shrink-0 text-slate-500">用途</dt>
                <dd>{request.project.buildingType}</dd>
              </div>
            )}
            {request.project.structure && (
              <div className="flex gap-4">
                <dt className="w-24 shrink-0 text-slate-500">構造</dt>
                <dd>{request.project.structure}</dd>
              </div>
            )}
            {request.project.address && (
              <div className="flex gap-4">
                <dt className="w-24 shrink-0 text-slate-500">住所</dt>
                <dd>{request.project.address}</dd>
              </div>
            )}
            {request.deadline && (
              <div className="flex gap-4">
                <dt className="w-24 shrink-0 text-slate-500">回答期限</dt>
                <dd className="font-medium text-red-600">
                  {request.deadline.getFullYear()}年{request.deadline.getMonth() + 1}月{request.deadline.getDate()}日
                </dd>
              </div>
            )}
          </dl>
        </div>

        {/* Status / Form */}
        {isExpired ? (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-6 text-center">
            <p className="text-lg font-bold text-red-700">回答期限を過ぎています</p>
            <p className="mt-2 text-sm text-red-600">
              この見積依頼の回答期限は終了しました。三和建設の担当者にお問い合わせください。
            </p>
          </div>
        ) : isSubmitted ? (
          <div className="mt-6 rounded-lg border border-green-200 bg-green-50 p-6 text-center">
            <p className="text-lg font-bold text-green-700">見積を提出済みです</p>
            <p className="mt-2 text-sm text-green-600">
              ご回答ありがとうございます。
            </p>
            {request.totalAmount !== null && (
              <p className="mt-4 text-2xl font-bold text-green-800">
                ¥{request.totalAmount.toLocaleString("ja-JP")}
              </p>
            )}
            {request.notes && (
              <p className="mt-2 text-sm text-slate-600">{request.notes}</p>
            )}
          </div>
        ) : (
          <SubmitForm requestId={request.id} />
        )}
      </main>

      <footer className="mt-12 border-t py-6 text-center text-xs text-slate-400">
        三和建設株式会社 見積徴収管理システム
      </footer>
    </div>
  );
}
