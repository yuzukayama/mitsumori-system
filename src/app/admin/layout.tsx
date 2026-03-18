import Link from "next/link";

const navItems = [
  { href: "/admin", label: "ダッシュボード" },
  { href: "/admin/projects", label: "案件管理" },
  { href: "/admin/partners", label: "協力会社" },
  { href: "/admin/templates", label: "テンプレート" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <aside className="w-64 border-r bg-sidebar p-4">
        <div className="mb-8">
          <h2 className="text-lg font-bold">見積管理</h2>
          <p className="text-sm text-muted-foreground">三和建設</p>
        </div>
        <nav className="space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-md px-3 py-2 text-sm transition-colors hover:bg-sidebar-accent"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
