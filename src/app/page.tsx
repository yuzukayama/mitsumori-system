import { auth } from "@/lib/auth";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await auth();
  if (session?.user) redirect("/admin");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-gradient-to-br from-slate-50 to-slate-100 p-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight text-slate-900">
          見積徴収管理システム
        </h1>
        <p className="mt-2 text-slate-500">三和建設株式会社</p>
      </div>
      <Link
        href="/auth/signin"
        className="rounded-lg bg-primary px-8 py-3 text-primary-foreground transition-colors hover:bg-primary/90"
      >
        ログイン
      </Link>
    </div>
  );
}
