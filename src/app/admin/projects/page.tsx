export default function ProjectsPage() {
  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">案件管理</h1>
        <button className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90">
          新規案件
        </button>
      </div>
      <p className="mt-2 text-muted-foreground">
        案件の一覧と見積依頼の管理を行います。
      </p>
      <div className="mt-8 rounded-lg border p-12 text-center text-muted-foreground">
        案件データはDB接続後に表示されます
      </div>
    </div>
  );
}
