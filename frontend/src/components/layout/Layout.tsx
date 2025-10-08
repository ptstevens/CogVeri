import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';

const Layout = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <Sidebar
        isOpen={isSidebarOpen}
        isMobileOpen={isMobileSidebarOpen}
        onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
        onMobileToggle={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-x-auto">
        {/* Header */}
        <Header
          onMenuClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
          onDesktopMenuClick={() => setIsSidebarOpen(!isSidebarOpen)}
        />

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-0">
          <div className="h-full p-6">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Mobile sidebar overlay */}
      {isMobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-gray-800 bg-opacity-50 md:bg-transparent transition-all z-20 lg:hidden"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}
    </div>
  );
};

export default Layout;