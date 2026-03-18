import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">
          見積徴収管理システム
        </h1>
        <p className="mt-2 text-muted-foreground">
          三和建設株式会社
        </p>
      </div>
      <div className="flex gap-4">
        <Link
          href="/admin"
          className="rounded-lg bg-primary px-6 py-3 text-primary-foreground transition-colors hover:bg-primary/90"
        >
          管理画面へ
        </Link>
      </div>
    </div>
  );
}
