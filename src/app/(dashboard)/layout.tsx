'use client';

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { useSession } from "@/modules/core/hooks/useSession";

const navItems = [
  { href: "/dashboard", label: "Painel" },
  { href: "/cadastro/produtos", label: "Produtos & Matérias-primas" },
  { href: "/producao/bom", label: "Composição (BOM)" },
  { href: "/estoque/entradas", label: "Entradas de Estoque" },
  { href: "/producao/ordens", label: "Ordens de Produção" },
  { href: "/producao/controle", label: "Controle de Produção" },
];

export default function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { session, isLoading, logout } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(true);

  // Fecha automaticamente em telas pequenas
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) setMenuOpen(false);
      else setMenuOpen(true);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (isLoading) return;
    if (!session) {
      router.replace("/");
      return;
    }
    if (!session.tenant) {
      logout();
      router.replace("/");
    }
  }, [isLoading, session, router, logout]);

  if (!session || !session.tenant) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <p className="text-sm text-slate-500">Carregando sessão...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex">
      {/* Botão hamburguer (visível só no mobile) */}
      <button
        onClick={() => setMenuOpen(!menuOpen)}
        className="absolute top-4 left-4 z-50 p-2 rounded-md bg-white shadow-md border border-slate-200 text-slate-700 hover:bg-slate-50 md:hidden"
      >
        {menuOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Menu lateral */}
      <aside
        className={`fixed md:static z-40 top-0 left-0 h-full w-72 bg-white border-r border-slate-200 flex flex-col transform transition-transform duration-300 ease-in-out 
        ${menuOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}
      >
        <div className="px-6 py-8 border-b border-slate-100">
          <div className="flex items-center gap-3">
            {session.tenant.logoUrl ? (
              <Image
                src={session.tenant.logoUrl}
                alt={`Logo ${session.tenant.name}`}
                width={120}
                height={48}
                className="h-22 w-200 object-contain rounded-lg border border-slate-100 bg-white p-1"
              />
            ) : (
              <div className="h-12 w-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-bold">
                {session.tenant.name.slice(0, 2).toUpperCase()}
              </div>
            )}
            {/* <div>
              <p className="text-sm text-slate-500 uppercase tracking-wide">
                Tenant
              </p>
              <p className="text-base font-semibold text-slate-900">
                {session.tenant.name}
              </p>
            </div> */}
          </div>
          <div className="mt-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-[12px] text-slate-600 leading-snug">
          Empresa ativa:
          <br />
          <span className="text-[14px] text-slate-900 capitalize">
            {session.tenant.name.toLowerCase()}
          </span>
        </div>
          
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => window.innerWidth < 1024 && setMenuOpen(false)} // Fecha o menu no mobile ao clicar
                className={`block px-4 py-3 rounded-xl text-sm font-medium transition ${
                  active
                    ? "bg-blue-50 text-blue-700 border border-blue-100"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-6 py-5 border-t border-slate-100">
          <button
            onClick={() => {
              logout();
              router.push("/");
            }}
            className="w-full text-sm font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-100 rounded-xl py-2"
          >
            Sair
          </button>
        </div>
      </aside>

      {/* Conteúdo principal */}
      <main className="flex-1 min-h-screen overflow-y-auto">
        <header className="sticky top-0 z-10 bg-white border-b border-slate-200 px-10 py-5 flex justify-between items-center backdrop-blur">
          <div>
            {/* <p className="text-xs text-slate-500 uppercase tracking-wide">
              {session.tenant.name}
            </p> */}
            <p className="text-xl font-semibold text-slate-900 ml-5">
              Operações de Produção
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-semibold text-slate-900">
                 {session.user.name} 
              </p>
              <p className="text-xs text-slate-500">{session.user.email}</p>
            </div>
            <div className="h-10 w-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-semibold">
              {session.user.name
                .split(" ")
                .map((n) => n[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </div>
          </div>
        </header>
        <div className="p-10">{children}</div>
      </main>
    </div>
  );
}
