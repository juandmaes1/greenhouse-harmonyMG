import { type ReactNode } from 'react';
import { BarChart3, ClipboardCheck, FlaskConical, Home, LogOut, Sprout, Users } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

const roleLabels = {
  admin: 'Administrador',
  engineer: 'Ingeniero',
  supervisor: 'Supervisor',
};

export default function AppLayout({ children }: { children: ReactNode }) {
  const { signOut, role, user } = useAuth();
  const location = useLocation();

  const navItems = [
    { to: '/', label: 'Invernaderos', icon: Home, roles: ['admin', 'engineer', 'supervisor'] },
    { to: '/chemicals', label: 'Químicos', icon: FlaskConical, roles: ['admin'] },
    { to: '/users', label: 'Usuarios', icon: Users, roles: ['admin'] },
    { to: '/stats', label: 'Estadísticas', icon: BarChart3, roles: ['admin'] },
    { to: '/supervisor', label: 'Supervisar', icon: ClipboardCheck, roles: ['supervisor'] },
  ];

  const visibleNav = navItems.filter(item => role && item.roles.includes(role));

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-card border-b px-4 py-3 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Sprout className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-heading font-bold text-lg">GreenField</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground hidden sm:block">
            {user?.email} · <span className="font-medium text-foreground">{role ? roleLabels[role] : ''}</span>
          </span>
          <Button variant="ghost" size="icon" onClick={signOut}>
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </header>

      <div className="flex flex-1">
        <nav className="w-14 sm:w-48 bg-card border-r flex flex-col py-4 gap-1 px-2 shrink-0">
          {visibleNav.map(item => {
            const active = location.pathname === item.to;

            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <main className="flex-1 p-4 sm:p-6 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
