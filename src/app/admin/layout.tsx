"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/admin", label: "ダッシュボード", icon: "📊" },
  { href: "/admin/projects", label: "案件管理", icon: "🏗️" },
  { href: "/admin/partners", label: "協力会社", icon: "🏢" },
  { href: "/admin/templates", label: "テンプレート", icon: "📋" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/admin") return pathname === "/admin";
    return pathname.startsWith(href);
  }

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 border-r bg-sidebar">
        <div className="border-b p-4">
          <h2 className="text-lg font-bold">見積管理</h2>
          <p className="text-xs text-muted-foreground">三和建設株式会社</p>
        </div>
        <nav className="p-2 space-y-0.5">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                isActive(item.href)
                  ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              }`}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto border-t p-4">
          <p className="text-[10px] text-muted-foreground">
            見積徴収管理システム v0.1
          </p>
          <p className="text-[10px] text-muted-foreground">
            デモデータ表示中
          </p>
        </div>
      </aside>
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  );
}
