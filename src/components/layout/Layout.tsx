
import React from 'react';
import { Link } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import BottomNav from './BottomNav';

interface LayoutProps {
  children: React.ReactNode;
  title: string;
  role: 'admin' | 'caregiver' | 'patient';
}

const Layout: React.FC<LayoutProps> = ({ children, title, role }) => {
  return (
    <div className="flex h-screen h-[100dvh] bg-gray-50 print:block print:h-auto print:bg-white">
      <Sidebar role={role} />
      
      <div className="flex-1 flex flex-col overflow-hidden print:overflow-visible">
        <Header title={title} role={role} />
        
        <main className="flex-1 overflow-y-auto p-4 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-4 print:overflow-visible print:p-0">
          {children}
        </main>
        
        <BottomNav role={role} />
      </div>
    </div>
  );
};

export default Layout;
