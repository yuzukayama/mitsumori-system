"use client";

import { useState, useTransition } from "react";
import { submitEstimate } from "@/app/actions/estimate-request";
import { useRouter } from "next/navigation";

interface Props {
  requestId: string;
}

export function SubmitForm({ requestId }: Props) {
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const router = useRouter();

  function handleSubmit() {
    const num = parseInt(amount.replace(/[,，]/g, ""), 10);
    if (isNaN(num) || num <= 0) {
      setError("見積金額を正しく入力してください");
      return;
    }

    if (!confirm(`見積金額 ¥${num.toLocaleString("ja-JP")} で提出しますか？\n提出後の変更はできません。`)) {
      return;
    }

    setError("");
    startTransition(async () => {
      const result = await submitEstimate(requestId, num, notes);
      if (result?.error) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="mt-6 rounded-lg border bg-white p-6">
      <h2 className="text-lg font-bold">見積金額を入力</h2>
      <p className="mt-1 text-sm text-slate-500">
        税抜き金額を入力してください。
      </p>

      <div className="mt-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700">
            見積金額（税抜）<span className="text-red-500">*</span>
          </label>
          <div className="relative mt-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
              ¥
            </span>
            <input
              type="text"
              inputMode="numeric"
              value={amount}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^0-9]/g, "");
                if (raw) {
                  setAmount(parseInt(raw, 10).toLocaleString("ja-JP"));
                } else {
                  setAmount("");
                }
              }}
              placeholder="0"
              className="block h-12 w-full rounded-lg border bg-white pl-8 pr-4 text-right text-xl font-bold outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">
            備考・条件など（任意）
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="特記事項があれば入力してください"
            className="mt-1 block w-full rounded-lg border bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={isPending || !amount}
        className="mt-6 w-full rounded-lg bg-blue-600 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
      >
        {isPending ? "送信中..." : "見積を提出する"}
      </button>

      <p className="mt-3 text-center text-xs text-slate-400">
        提出後の変更はできません。内容をご確認のうえ提出してください。
      </p>
    </div>
  );
}
