export default function PartnersPage() {
  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">協力会社</h1>
        <div className="flex gap-2">
          <button className="rounded-lg border px-4 py-2 text-sm hover:bg-accent">
            CSVインポート
          </button>
          <button className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90">
            新規登録
          </button>
        </div>
      </div>
      <p className="mt-2 text-muted-foreground">
        協力会社の情報を管理します。iNDEXからのCSVインポートにも対応しています。
      </p>
      <div className="mt-8 rounded-lg border p-12 text-center text-muted-foreground">
        協力会社データはDB接続後に表示されます
      </div>
    </div>
  );
}
