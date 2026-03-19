import Link from "next/link";

export default function AuthErrorPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="w-full max-w-md rounded-xl border bg-white p-8 shadow-lg text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
          <span className="text-2xl">⚠️</span>
        </div>
        <h1 className="text-xl font-bold text-slate-900">
          ログインエラー
        </h1>
        <p className="mt-3 text-sm text-slate-600">
          ログインに失敗しました。<br />
          <strong>@sgc-web.co.jp</strong> のGoogleアカウントでログインしてください。
        </p>
        <p className="mt-2 text-xs text-slate-400">
          個人のGmailアカウントや他のドメインではログインできません。
        </p>
        <Link
          href="/auth/signin"
          className="mt-6 inline-block rounded-lg bg-primary px-6 py-2.5 text-sm text-primary-foreground hover:bg-primary/90"
        >
          ログイン画面に戻る
        </Link>
      </div>
    </div>
  );
}
