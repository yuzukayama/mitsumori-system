import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AdminNav } from "./nav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/signin");
  }

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-64 flex-col border-r bg-sidebar">
        <div className="border-b p-4">
          <h2 className="text-lg font-bold">見積管理</h2>
          <p className="text-xs text-muted-foreground">三和建設株式会社</p>
        </div>
        <AdminNav />
        <div className="mt-auto border-t p-4">
          <div className="flex items-center gap-2">
            {session.user.image && (
              <img
                src={session.user.image}
                alt=""
                className="h-7 w-7 rounded-full"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">
                {session.user.name}
              </p>
              <p className="truncate text-[10px] text-muted-foreground">
                {session.user.email}
              </p>
            </div>
          </div>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/auth/signin" });
            }}
          >
            <button
              type="submit"
              className="mt-3 w-full rounded-md border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              ログアウト
            </button>
          </form>
          <p className="mt-3 text-[10px] text-muted-foreground">
            見積徴収管理システム v0.1
          </p>
        </div>
      </aside>
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  );
}
