import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useAuth } from '@/contexts/AuthContext';
import { useNavBadges } from '@/hooks/useNavBadges';
import { cn } from '@/lib/utils';
import { NAV_ITEMS, isActivePath } from './navItems';

interface BottomNavProps {
  role: 'admin' | 'caregiver' | 'patient';
}

const Badge: React.FC<{ count: number; className?: string }> = ({ count, className }) =>
  count > 0 ? (
    <span className={cn('rounded-full bg-red-500 text-white text-[10px] font-semibold px-1 min-w-[1rem] text-center', className)}>
      {count > 9 ? '9+' : count}
    </span>
  ) : null;

/** Phone menu: the 4 main pages, plus "More" which opens every other page. */
const BottomNav: React.FC<BottomNavProps> = ({ role }) => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const badges = useNavBadges();
  const [open, setOpen] = useState(false);

  const items = NAV_ITEMS[role];
  const main = items.filter((i) => i.bottom);
  const more = items.filter((i) => !i.bottom);
  const moreActive = more.some((i) => isActivePath(i.href, pathname));
  const moreBadge = more.reduce((n, i) => n + badges.forHref(i.href), 0);

  const logout = async () => {
    setOpen(false);
    await signOut();
    toast.success("You've been logged out successfully");
    navigate('/');
  };

  const tab = 'flex flex-col items-center justify-center flex-1 min-w-0 h-full px-1';

  return (
    <>
      <nav
        className="print:hidden md:hidden fixed bottom-0 inset-x-0 z-20 bg-white border-t border-gray-200 pb-[env(safe-area-inset-bottom)]"
        aria-label="Main menu"
      >
        <div className="flex h-16">
          {main.map((item) => {
            const active = isActivePath(item.href, pathname);
            return (
              <Link key={item.href} to={item.href} className={cn(tab, active ? 'text-primary' : 'text-gray-500')}>
                <span className="relative">
                  <item.icon className="w-6 h-6 mb-1" />
                  <Badge count={badges.forHref(item.href)} className="absolute -top-1 -right-2" />
                </span>
                <span className="text-[11px] font-medium truncate max-w-full">{item.label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={cn(tab, moreActive || open ? 'text-primary' : 'text-gray-500')}
            aria-haspopup="dialog"
          >
            <span className="relative">
              <MoreHorizontal className="w-6 h-6 mb-1" />
              <Badge count={moreBadge} className="absolute -top-1 -right-2" />
            </span>
            <span className="text-[11px] font-medium">More</span>
          </button>
        </div>
      </nav>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="md:hidden rounded-t-2xl px-4 pt-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] max-h-[85dvh] overflow-y-auto">
          <SheetHeader className="text-left mb-4">
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-3 gap-2">
            {items.map((item) => {
              const active = isActivePath(item.href, pathname);
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    'relative flex flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-3 text-center',
                    active ? 'border-primary bg-primary/5 text-primary' : 'border-gray-200 text-gray-700 active:bg-gray-50',
                  )}
                >
                  <item.icon className="w-6 h-6" />
                  <span className="text-xs font-medium leading-tight">{item.label}</span>
                  <Badge count={badges.forHref(item.href)} className="absolute top-1.5 right-1.5" />
                </Link>
              );
            })}
          </div>
          <button
            type="button"
            onClick={logout}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 py-3 text-sm font-medium text-red-700 active:bg-red-50"
          >
            <LogOut className="w-4 h-4" />
            Log out
          </button>
        </SheetContent>
      </Sheet>
    </>
  );
};

export default BottomNav;
