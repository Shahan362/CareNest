
import React, { useState } from 'react';
import { ArrowLeftRight, Bell, LogOut } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useIsMobile } from '@/hooks/use-mobile';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { useAuth, displayName } from '@/contexts/AuthContext';
import { ROLE_LABEL } from '@/lib/supabase';
import { useUnreadNotificationCount } from '@/hooks/data/useNotifications';

interface HeaderProps {
  title: string;
  role: 'admin' | 'caregiver' | 'patient';
}

const Header: React.FC<HeaderProps> = ({ title, role }) => {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const unread = useUnreadNotificationCount().data ?? 0;

  const getNotificationsUrl = () => {
    switch (role) {
      case 'admin':
        return '/admin/notifications';
      case 'caregiver':
        return '/caregiver/notifications'; 
      case 'patient':
        return '/patient/notifications';
      default:
        return '/';
    }
  };

  const getRoleSpecificInfo = () => {
    switch (role) {
      case 'admin':
        return {
          name: displayName(profile),
          title: ROLE_LABEL.admin,
          profilePath: '/admin/settings'
        };
      case 'caregiver':
        return {
          name: displayName(profile),
          title: ROLE_LABEL.caregiver,
          profilePath: '/caregiver/profile'
        }; 
      case 'patient':
        return {
          name: displayName(profile),
          title: ROLE_LABEL.patient,
          profilePath: '/patient/profile'
        };
    }
  };

  const handleLogout = async () => {
    await signOut();
    toast.success("You've been logged out successfully");
    navigate('/');
  };

  const roleInfo = getRoleSpecificInfo();

  return (
    <header className="print:hidden bg-white border-b border-gray-200 sticky top-0 z-10">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="md:hidden font-bold text-secondary text-lg">CareNest</div>
        <h1 className="text-xl font-bold md:text-2xl hidden md:block">{title}</h1>
        <div className="flex items-center space-x-4">
          <Link
            to={getNotificationsUrl()}
            className="relative p-1 rounded-full hover:bg-gray-100"
            aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
          >
            <Bell className="h-5 w-5 text-gray-600" />
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 rounded-full bg-red-500 text-white text-[10px] font-semibold px-1 min-w-[1rem] text-center ring-2 ring-white">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div className="flex items-center cursor-pointer">
                <div className="hidden md:block text-sm text-right mr-3">
                  <div className="font-medium">{roleInfo.name}</div>
                  <div className="text-xs text-gray-500">{roleInfo.title}{profile?.agency?.name && role !== 'admin' ? ` · ${profile.agency.name}` : ''}</div>
                </div>
                <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-secondary font-medium">
                  {(roleInfo.name || role).charAt(0).toUpperCase()}
                </div>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {role === 'admin' && profile?.agency && (
                <>
                  <div className="px-2 py-1.5 text-xs text-gray-500">
                    Agency code (share with caregivers and patients)
                    <div className="font-mono text-base font-semibold text-gray-900 tracking-wider">{profile.agency.code}</div>
                  </div>
                  <DropdownMenuSeparator />
                </>
              )}
              {role !== 'admin' && (
                <>
                  <div className="px-2 py-1.5 text-xs text-gray-500">
                    Using
                    <div className="text-sm font-semibold text-gray-900">{profile?.agency?.name}</div>
                  </div>
                  <DropdownMenuItem onClick={() => navigate('/choose-agency')}>
                    <ArrowLeftRight className="h-4 w-4 mr-2" />
                    Switch or join agency
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem onClick={() => navigate(roleInfo.profilePath)}>
                Profile
              </DropdownMenuItem>
              {role === 'admin' && (
                <DropdownMenuItem onClick={() => navigate('/admin/settings')}>
                  Settings
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-red-500">
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="md:hidden px-4 py-2">
        <h1 className="text-xl font-bold">{title}</h1>
        {role !== 'admin' && profile?.agency?.name && (
          <Link to="/choose-agency" className="text-xs text-gray-500 hover:text-primary">
            {profile.agency.name} · <span className="text-primary">Switch</span>
          </Link>
        )}
      </div>
    </header>
  );
};

export default Header;
