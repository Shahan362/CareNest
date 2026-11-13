
import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, displayName } from '@/contexts/AuthContext';
import { ROLE_LABEL } from '@/lib/supabase';
import { 
  Calendar, 
  Home, 
  MessageSquare, 
  Settings, 
  User,
  Bell,
  FileText,
  Clock,
  LogOut,
  Clipboard,
  Award,
  Heart,
  ThumbsUp,
  Send,
  FileCheck,
  FileEdit,
  Users,
  DollarSign,
  BarChart,
  CalendarDays
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavBadges } from '@/hooks/useNavBadges';
import { toast } from 'sonner';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface SidebarProps {
  role: 'admin' | 'caregiver' | 'patient';
}

const Sidebar: React.FC<SidebarProps> = ({ role }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const name = displayName(profile);
  
  const adminNavItems: NavItem[] = [
    { label: 'Dashboard', href: '/admin', icon: Home },
    { label: 'Scheduler', href: '/admin/scheduler', icon: CalendarDays },
    { label: 'Calendar', href: '/admin/calendar', icon: Calendar },
    { label: 'Caregivers', href: '/admin/caregivers', icon: Users },
    { label: 'Patients', href: '/admin/patients', icon: Heart },
    { label: 'Requests', href: '/admin/requests', icon: Send },
    { label: 'Billing', href: '/admin/billing', icon: DollarSign },
    { label: 'Reports', href: '/admin/reports', icon: BarChart },
    { label: 'Messages', href: '/admin/messages', icon: MessageSquare },
    { label: 'Notifications', href: '/admin/notifications', icon: Bell },
    { label: 'Settings', href: '/admin/settings', icon: Settings },
  ];
  
  const caregiverNavItems: NavItem[] = [
    { label: 'Home', href: '/caregiver', icon: Home },
    { label: 'Schedule', href: '/caregiver/schedule', icon: Calendar },
    { label: 'My Patients', href: '/caregiver/patients', icon: Users },
    { label: 'Messages', href: '/caregiver/messages', icon: MessageSquare },
    { label: 'Notifications', href: '/caregiver/notifications', icon: Bell },
    { label: 'Profile', href: '/caregiver/profile', icon: User },
  ];
  
  const patientNavItems: NavItem[] = [
    { label: 'Home', href: '/patient', icon: Home },
    { label: 'My Visits', href: '/patient/visits', icon: Clock },
    { label: 'Care Plan', href: '/patient/care-plan', icon: FileCheck },
    { label: 'Requests', href: '/patient/requests', icon: Send },
    { label: 'Invoices', href: '/patient/invoices', icon: FileText },
    { label: 'Feedback', href: '/patient/feedback', icon: ThumbsUp },
    { label: 'Messages', href: '/patient/messages', icon: MessageSquare },
    { label: 'Notifications', href: '/patient/notifications', icon: Bell },
    { label: 'Profile', href: '/patient/profile', icon: User },
  ];
  
  const navItemsByRole = {
    admin: adminNavItems,
    caregiver: caregiverNavItems,
    patient: patientNavItems,
  };
  
  const navItems = navItemsByRole[role];
  const badges = useNavBadges();
  
  const handleLogout = async () => {
    await signOut();
    toast.success("You've been logged out successfully");
    navigate('/');
  };
  
  return (
    <aside className="print:hidden hidden md:flex flex-col w-64 h-screen bg-secondary text-white">
      <div className="p-4 flex items-center">
        <h1 className="text-xl font-bold">CareNest</h1>
      </div>
      
      <div className="p-2 flex-grow">
        <div className="text-sm uppercase text-white/60 mb-2 px-3">
          {role === 'admin' ? 'Agency Admin' : role.charAt(0).toUpperCase() + role.slice(1)}
        </div>
        <nav className="space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.href || (item.href.split('/').length > 2 && location.pathname.startsWith(item.href + '/'));
            
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
