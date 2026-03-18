export default function AdminDashboard() {
  return (
    <div>
      <h1 className="text-2xl font-bold">ダッシュボード</h1>
      <p className="mt-2 text-muted-foreground">
        見積依頼の進捗状況を確認できます。
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "案件数", value: "—", description: "進行中" },
          { label: "見積依頼", value: "—", description: "依頼中" },
          { label: "提出済", value: "—", description: "未確認" },
          { label: "協力会社", value: "—", description: "登録数" },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-lg border bg-card p-6"
          >
            <p className="text-sm text-muted-foreground">{card.label}</p>
            <p className="mt-1 text-3xl font-bold">{card.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {card.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
