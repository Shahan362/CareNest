
import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, displayName } from '@/contexts/AuthContext';
import { ROLE_LABEL } from '@/lib/supabase';
import { LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavBadges } from '@/hooks/useNavBadges';
import { NAV_ITEMS, isActivePath } from './navItems';
import { toast } from 'sonner';

interface SidebarProps {
  role: 'admin' | 'caregiver' | 'patient';
}

const Sidebar: React.FC<SidebarProps> = ({ role }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const name = displayName(profile);
  
  const navItems = NAV_ITEMS[role];
  const badges = useNavBadges();
  
  const handleLogout = async () => {
    await signOut();
    toast.success("You've been logged out successfully");
    navigate('/');
  };
  
  return (
    <aside className="print:hidden hidden md:flex flex-col w-64 h-full bg-secondary text-white">
      <div className="p-4 flex items-center">
        <h1 className="text-xl font-bold">CareNest</h1>
      </div>
      
      <div className="p-2 flex-grow">
        <div className="text-sm uppercase text-white/60 mb-2 px-3">
          {role === 'admin' ? 'Agency Admin' : role.charAt(0).toUpperCase() + role.slice(1)}
        </div>
        <nav className="space-y-1">
          {navItems.map((item) => {
            const isActive = isActivePath(item.href, location.pathname);
            
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "flex items-center px-3 py-2 rounded-md transition-colors",
                  isActive 
                    ? "bg-primary text-white" 
                    : "text-white/80 hover:bg-white/10"
                )}
              >
                <item.icon className="w-5 h-5 mr-3" />
                <span>{item.label}</span>
                {badges.forHref(item.href) > 0 && (
                  <span className="ml-auto rounded-full bg-red-500 text-white text-xs font-semibold px-1.5 min-w-[1.25rem] text-center">
                    {badges.forHref(item.href) > 99 ? '99+' : badges.forHref(item.href)}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>
      
      <div className="p-2">
        <button
          onClick={handleLogout}
          className="flex items-center px-3 py-2 rounded-md transition-colors w-full text-white/80 hover:bg-white/10"
        >
          <LogOut className="w-5 h-5 mr-3" />
          <span>Logout</span>
        </button>
      </div>
      
      <div className="p-4 border-t border-white/10">
        <div className="flex items-center">
          <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-secondary font-medium mr-2">
            {(name || role).charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="text-sm font-medium">
              {name}
            </div>
            <div className="text-xs text-white/60">
              {ROLE_LABEL[role]}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
