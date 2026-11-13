import {
  BarChart,
  Bell,
  Calendar,
  CalendarDays,
  Clock,
  DollarSign,
  FileCheck,
  FileText,
  Heart,
  Home,
  MessageSquare,
  Send,
  Settings,
  ThumbsUp,
  User,
  Users,
} from 'lucide-react';
import type { Role } from '@/lib/supabase';

export interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Shown in the phone's bottom bar (max 4); everything else goes under "More". */
  bottom?: boolean;
}

/** The menu for each role. Used by the desktop sidebar and the phone bottom bar. */
export const NAV_ITEMS: Record<Role, NavItem[]> = {
  admin: [
    { label: 'Dashboard', href: '/admin', icon: Home, bottom: true },
    { label: 'Scheduler', href: '/admin/scheduler', icon: CalendarDays },
    { label: 'Calendar', href: '/admin/calendar', icon: Calendar, bottom: true },
    { label: 'Caregivers', href: '/admin/caregivers', icon: Users },
    { label: 'Patients', href: '/admin/patients', icon: Heart, bottom: true },
    { label: 'Requests', href: '/admin/requests', icon: Send },
    { label: 'Billing', href: '/admin/billing', icon: DollarSign },
    { label: 'Reports', href: '/admin/reports', icon: BarChart },
    { label: 'Messages', href: '/admin/messages', icon: MessageSquare, bottom: true },
    { label: 'Notifications', href: '/admin/notifications', icon: Bell },
    { label: 'Settings', href: '/admin/settings', icon: Settings },
  ],
  caregiver: [
    { label: 'Home', href: '/caregiver', icon: Home, bottom: true },
    { label: 'Schedule', href: '/caregiver/schedule', icon: Calendar, bottom: true },
    { label: 'My Patients', href: '/caregiver/patients', icon: Users, bottom: true },
    { label: 'Messages', href: '/caregiver/messages', icon: MessageSquare, bottom: true },
    { label: 'Notifications', href: '/caregiver/notifications', icon: Bell },
    { label: 'Profile', href: '/caregiver/profile', icon: User },
  ],
  patient: [
    { label: 'Home', href: '/patient', icon: Home, bottom: true },
    { label: 'My Visits', href: '/patient/visits', icon: Clock, bottom: true },
    { label: 'Care Plan', href: '/patient/care-plan', icon: FileCheck },
    { label: 'Requests', href: '/patient/requests', icon: Send, bottom: true },
    { label: 'Invoices', href: '/patient/invoices', icon: FileText },
    { label: 'Feedback', href: '/patient/feedback', icon: ThumbsUp },
    { label: 'Messages', href: '/patient/messages', icon: MessageSquare, bottom: true },
    { label: 'Notifications', href: '/patient/notifications', icon: Bell },
    { label: 'Profile', href: '/patient/profile', icon: User },
  ],
};

/** True when the menu item matches the current page (including its sub-pages). */
export const isActivePath = (href: string, pathname: string) =>
  pathname === href || (href.split('/').length > 2 && pathname.startsWith(href + '/'));
