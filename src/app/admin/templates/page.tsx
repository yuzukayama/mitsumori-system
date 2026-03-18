export default function TemplatesPage() {
  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">テンプレート</h1>
        <button className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90">
          Excelアップロード
        </button>
      </div>
      <p className="mt-2 text-muted-foreground">
        工種ごとの見積テンプレートを管理します。
      </p>
      <div className="mt-8 rounded-lg border p-12 text-center text-muted-foreground">
        テンプレートデータはDB接続後に表示されます
      </div>
    </div>
  );
}
