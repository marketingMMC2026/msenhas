import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Lock, FileText, Users, User, FileBarChart, Settings, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';

const Sidebar = ({ isOpen, onClose }) => {
  const { t } = useLanguage();
  const { can } = useAuth();
  const navItems = [
    { path: '/dashboard', label: t('dashboard'), icon: LayoutDashboard },
    { path: '/vault', label: t('vault'), icon: Lock },
    { path: '/requests', label: t('requests'), icon: FileText },
    { path: '/groups', label: t('groups'), icon: Users, capability: 'manageGroups' },
    { path: '/users', label: t('users'), icon: User, capability: 'manageUsers' },
    { path: '/logs', label: t('logs'), icon: FileBarChart, capability: 'viewLogs' },
    { path: '/settings', label: t('settings'), icon: Settings, capability: 'manageSettings' },
  ].filter((item) => !item.capability || can(item.capability));

  return (
    <>
      {isOpen && <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={onClose} />}
      <aside className={cn('fixed lg:sticky top-0 left-0 z-50 h-screen w-64 bg-white border-r border-gray-200 transition-transform duration-300 ease-in-out lg:translate-x-0', isOpen ? 'translate-x-0' : '-translate-x-full')}>
        <div className="lg:hidden flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Menu</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 transition-colors" aria-label="Fechar menu"><X className="h-5 w-5 text-gray-600" /></button>
        </div>
        <nav className="p-4 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.path} to={item.path} onClick={() => onClose()} className={({ isActive }) => cn('flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200', 'hover:bg-gray-100', isActive ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-700')}>
                {({ isActive }) => <><Icon className={cn('h-5 w-5 transition-colors', isActive ? 'text-blue-600' : 'text-gray-500')} /><span>{item.label}</span></>}
              </NavLink>
            );
          })}
        </nav>
      </aside>
    </>
  );
};

export default Sidebar;
