import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  Printer,
  Images,
  Building2,
  Users,
  LogOut,
  Menu,
  Tag,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  masterOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Painel', icon: LayoutDashboard },
  { to: '/produtos', label: 'Produtos', icon: Package },
  { to: '/imprimir', label: 'Imprimir Etiqueta', icon: Printer },
  { to: '/fotos', label: 'Fotos', icon: Images },
  { to: '/admin/empresas', label: 'Empresas', icon: Building2, masterOnly: true },
  { to: '/admin/usuarios', label: 'Usuarios', icon: Users, masterOnly: true },
];

export function Layout() {
  const { profile, isMaster, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const items = NAV_ITEMS.filter((i) => !i.masterOnly || isMaster);

  return (
    <div className="flex min-h-screen bg-slate-50">
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 transform flex-col border-r border-neutral-200 bg-white transition-transform lg:static lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-2 border-b border-neutral-200 px-5 py-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white">
            <Tag size={18} />
          </span>
          <span className="text-base font-semibold text-neutral-800">Etiqueta</span>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'text-neutral-600 hover:bg-neutral-100'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-neutral-200 p-3">
          <div className="mb-2 px-2">
            <p className="truncate text-sm font-medium text-neutral-800">
              {profile?.full_name ?? profile?.email}
            </p>
            <p className="text-xs text-neutral-500">
              {isMaster ? 'Usuario master' : 'Usuario da empresa'}
            </p>
          </div>
          <button
            onClick={signOut}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100"
          >
            <LogOut size={18} />
            Sair
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-neutral-200 bg-white px-4 py-3 lg:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menu"
            className="rounded-lg p-1.5 text-neutral-600 hover:bg-neutral-100"
          >
            <Menu size={22} />
          </button>
          <span className="text-base font-semibold text-neutral-800">Etiqueta</span>
        </header>

        <main className="flex-1 overflow-x-clip p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
