
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Calendar, Home, MessageSquare, Settings, User, Users, Bell, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavBadges } from '@/hooks/useNavBadges';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface BottomNavProps {
  role: 'admin' | 'caregiver' | 'patient';
}

const BottomNav: React.FC<BottomNavProps> = ({ role }) => {
  const location = useLocation();
  
  // Reduced navigation items for mobile - only showing most important
  const adminNavItems: NavItem[] = [
    { label: 'Dashboard', href: '/admin', icon: Home },
    { label: 'Calendar', href: '/admin/calendar', icon: Calendar },
    { label: 'Requests', href: '/admin/requests', icon: Send },
    { label: 'Messages', href: '/admin/messages', icon: MessageSquare },
  ];
  
  const caregiverNavItems: NavItem[] = [
    { label: 'Home', href: '/caregiver', icon: Home },
    { label: 'Schedule', href: '/caregiver/schedule', icon: Calendar },
    { label: 'Patients', href: '/caregiver/patients', icon: Users },
    { label: 'Messages', href: '/caregiver/messages', icon: MessageSquare },
  ];
  
  const patientNavItems: NavItem[] = [
    { label: 'Home', href: '/patient', icon: Home },
    { label: 'Visits', href: '/patient/visits', icon: Calendar },
    { label: 'Requests', href: '/patient/requests', icon: Send },
    { label: 'Messages', href: '/patient/messages', icon: MessageSquare },
  ];
  
  const navItemsByRole = {
    admin: adminNavItems,
    caregiver: caregiverNavItems,
    patient: patientNavItems,
  };
  
  const navItems = navItemsByRole[role];
  const badges = useNavBadges();

  return (
    <nav className="print:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around items-center h-16 md:hidden z-10">
      {navItems.map((item) => {
        const isActive = location.pathname === item.href || (item.href.split('/').length > 2 && location.pathname.startsWith(item.href + '/'));
        
        return (
          <Link 
            key={item.href}
            to={item.href} 
            className={cn(
              "flex flex-col items-center justify-center px-2 py-1 w-full",
              isActive ? "text-primary" : "text-gray-500"
            )}
          >
            <span className="relative">
              <item.icon className={cn(
                "w-6 h-6 mb-1",
                isActive ? "text-primary" : "text-gray-500"
              )} />
              {badges.forHref(item.href) > 0 && (
                <span className="absolute -top-1 -right-2 rounded-full bg-red-500 text-white text-[10px] font-semibold px-1 min-w-[1rem] text-center">
                  {badges.forHref(item.href) > 9 ? '9+' : badges.forHref(item.href)}
                </span>
              )}
            </span>
            <span className="text-xs font-medium">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
};

export default BottomNav;

