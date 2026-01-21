import { useState, useCallback, Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Sidebar from './Sidebar';
import Header from './Header';
import LoadingSpinner from '../ui/LoadingSpinner';
import { SidebarErrorBoundary, MainContentErrorBoundary } from '../ErrorBoundary';

const Layout = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Memoize callbacks to prevent unnecessary re-renders of Sidebar and Header
  const handleSidebarToggle = useCallback(() => {
    setIsSidebarOpen(prev => !prev);
  }, []);

  const handleMobileSidebarToggle = useCallback(() => {
    setIsMobileSidebarOpen(prev => !prev);
  }, []);

  const handleMobileSidebarClose = useCallback(() => {
    setIsMobileSidebarOpen(false);
  }, []);

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar - wrapped with error boundary to keep main content usable if sidebar fails */}
      <SidebarErrorBoundary>
        <Sidebar
          isOpen={isSidebarOpen}
          isMobileOpen={isMobileSidebarOpen}
          onToggle={handleSidebarToggle}
          onMobileToggle={handleMobileSidebarToggle}
        />
      </SidebarErrorBoundary>

      {/* Sidebar Toggle Arrow - Desktop only */}
      <button
        onClick={handleSidebarToggle}
        aria-label={isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        className="hidden lg:flex absolute top-1/2 -translate-y-1/2 z-30 w-6 h-12 items-center justify-center bg-white border border-gray-200 rounded-r-lg shadow-sm hover:bg-gray-50 hover:shadow transition-all"
        style={{ left: isSidebarOpen ? '286px' : '90px' }}
      >
        {isSidebarOpen ? (
          <ChevronLeft className="w-4 h-4 text-gray-500" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-500" />
        )}
      </button>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-x-auto">
        {/* Header */}
        <Header
          onMenuClick={handleMobileSidebarToggle}
          onDesktopMenuClick={handleSidebarToggle}
        />

        {/* Page Content - wrapped with error boundary to catch page-level errors */}
        <main className="flex-1 overflow-y-auto p-0 bg-gray-100">
          <div className="h-full p-6">
            <MainContentErrorBoundary>
              <Suspense fallback={<LoadingSpinner />}>
                <Outlet />
              </Suspense>
            </MainContentErrorBoundary>
          </div>
        </main>
      </div>

      {/* Mobile sidebar overlay */}
      {isMobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 transition-all z-20 lg:hidden"
          onClick={handleMobileSidebarClose}
        />
      )}
    </div>
  );
};

export default Layout;