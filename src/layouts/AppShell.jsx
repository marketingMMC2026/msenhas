import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/hooks/useAuth';

const AppShell = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  // Debug Hook
  const { user, isAdmin, profile, loading } = useAuth();
  const isDev = import.meta.env.DEV;

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 relative">
        <Header onMenuClick={() => setIsSidebarOpen(true)} />
        
        <div className="flex">
          <Sidebar 
            isOpen={isSidebarOpen} 
            onClose={() => setIsSidebarOpen(false)} 
          />
          
          <main className="flex-1 p-6 lg:p-8 min-h-[calc(100vh-4rem)]">
            <Outlet />
          </main>
        </div>

        {/* DEBUG BOX - Visible only in development */}
        {isDev && (
         <div className="fixed bottom-4 right-4 bg-gray-900 text-white p-4 rounded shadow-lg text-xs max-w-sm z-50 font-mono opacity-90 pointer-events-none">
            <div className="font-bold border-b border-gray-700 pb-2 mb-2">DEV DEBUG: AppShell</div>
            <div className="space-y-1">
                <div className="flex justify-between gap-4">
                    <span>User:</span> 
                    <span className="truncate max-w-[120px]">{user?.email || 'None'}</span>
                </div>
                <div className="flex justify-between gap-4">
                    <span>Admin:</span> 
                    <span>{isAdmin ? '✅ YES' : '❌ NO'}</span>
                </div>
                <div className="flex justify-between gap-4">
                    <span>Profile Loaded:</span> 
                    <span>{profile ? '✅' : '❌'}</span>
                </div>
                <div className="flex justify-between gap-4">
                    <span>Loading:</span> 
                    <span>{loading ? '⏳' : '✅ Done'}</span>
                </div>
            </div>
         </div>
       )}
      </div>
    </ProtectedRoute>
  );
};

export default AppShell;