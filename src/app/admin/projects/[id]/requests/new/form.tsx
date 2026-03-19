"use client";

import { useState, useTransition } from "react";
import { createEstimateRequests } from "@/app/actions/estimate-request";

interface Partner {
  id: string;
  name: string;
  contactName: string | null;
  email: string;
  tradeTypes: string[];
}

interface Props {
  projectId: string;
  tradeType: string;
  partners: Partner[];
  alreadyRequestedIds: string[];
}

export function RequestForm({
  projectId,
  tradeType,
  partners,
  alreadyRequestedIds,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deadline, setDeadline] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().split("T")[0];
  });
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const availablePartners = partners.filter(
    (p) => !alreadyRequestedIds.includes(p.id)
  );

  function togglePartner(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(availablePartners.map((p) => p.id)));
  }

  function deselectAll() {
    setSelected(new Set());
  }

  function handleSubmit() {
    if (selected.size === 0) {
      setError("協力会社を1社以上選択してください");
      return;
    }
    setError("");
    startTransition(async () => {
      const result = await createEstimateRequests({
        projectId,
        tradeType,
        partnerIds: [...selected],
        deadline,
      });
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="mt-6 space-y-6">
      {/* Deadline */}
      <div>
        <label className="text-sm font-medium">回答期限</label>
        <input
          type="date"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          className="mt-1 block h-9 w-48 rounded-md border bg-background px-3 text-sm"
        />
      </div>

      {/* Partner Selection */}
      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">
            協力会社を選択（{tradeType}：{availablePartners.length}社）
          </h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={selectAll}
              className="text-xs text-primary hover:underline"
            >
              すべて選択
            </button>
            <button
              type="button"
              onClick={deselectAll}
              className="text-xs text-muted-foreground hover:underline"
            >
              解除
            </button>
          </div>
        </div>

        {availablePartners.length === 0 ? (
          <div className="mt-3 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            {partners.length === 0
              ? `「${tradeType}」に対応する協力会社が見つかりません`
              : "すべての協力会社に依頼済みです"}
          </div>
        ) : (
          <div className="mt-3 max-h-96 overflow-y-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                <tr>
                  <th className="w-10 px-4 py-2"></th>
                  <th className="px-4 py-2 text-left font-medium">会社名</th>
                  <th className="px-4 py-2 text-left font-medium">担当者</th>
                  <th className="px-4 py-2 text-left font-medium">メール</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {availablePartners.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => togglePartner(p.id)}
                    className={`cursor-pointer transition-colors ${
                      selected.has(p.id)
                        ? "bg-primary/5"
                        : "hover:bg-muted/30"
                    }`}
                  >
                    <td className="px-4 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={selected.has(p.id)}
                        onChange={() => togglePartner(p.id)}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-2 font-medium">{p.name}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {p.contactName ?? "—"}
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-2 text-xs text-muted-foreground">
                      {p.email}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {alreadyRequestedIds.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            ※ 既に依頼済みの{alreadyRequestedIds.length}社は非表示です
          </p>
        )}
      </div>

      {/* Submit */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="flex items-center gap-4 border-t pt-4">
        <button
          onClick={handleSubmit}
          disabled={isPending || selected.size === 0}
          className="rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {isPending
            ? "作成中..."
            : `${selected.size}社に見積依頼を送信`}
        </button>
        <p className="text-xs text-muted-foreground">
          各社にトークン付きURLが生成されます
        </p>
      </div>
    </div>
  );
}
