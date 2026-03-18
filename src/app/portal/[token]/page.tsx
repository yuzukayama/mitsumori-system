type PortalPageProps = {
  params: Promise<{ token: string }>;
};

export default async function PortalPage({ params }: PortalPageProps) {
  const { token } = await params;

  return (
    <div className="mx-auto max-w-4xl p-6">
      <header className="mb-8 border-b pb-4">
        <h1 className="text-2xl font-bold">見積入力ポータル</h1>
        <p className="text-sm text-muted-foreground">三和建設株式会社</p>
      </header>
      <div className="rounded-lg border p-12 text-center text-muted-foreground">
        トークン: {token.slice(0, 8)}...
        <br />
        DB接続後に見積フォームが表示されます
      </div>
    </div>
  );
}
