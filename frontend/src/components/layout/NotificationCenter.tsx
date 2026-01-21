import { useState, useRef, useEffect } from 'react';
import { Bell, Check, CheckCheck, ExternalLink, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../../contexts/SocketContext';
import api from '../../services/api';
import toast from 'react-hot-toast';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  entity_type?: string;
  entity_id?: string;
  action_url?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  metadata?: Record<string, any>;
  is_read: boolean;
  created_at: string;
}

// Maximum notifications to keep in memory to prevent unbounded growth
const MAX_NOTIFICATIONS_IN_MEMORY = 100;

const NotificationCenter = () => {
  const navigate = useNavigate();
  const { socket, isConnected } = useSocket();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch unread count on mount
  useEffect(() => {
    fetchUnreadCount();
  }, []);

  // Fetch notifications when dropdown opens
  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen]);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Listen for real-time notification updates
  useEffect(() => {
    if (!socket) return;

    const handleNewNotification = (notification: Notification) => {
      setNotifications((prev) => {
        // Add new notification at the beginning
        const updated = [notification, ...prev];
        // Evict oldest notifications if we exceed the limit (keeps newest ones)
        if (updated.length > MAX_NOTIFICATIONS_IN_MEMORY) {
          return updated.slice(0, MAX_NOTIFICATIONS_IN_MEMORY);
        }
        return updated;
      });
      setUnreadCount((prev) => prev + 1);

      // Show toast for new notifications
      toast(notification.title, {
        icon: getNotificationIcon(notification.type),
        duration: 4000,
      });
    };

    const handleNotificationRead = ({ id }: { id: string }) => {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
    };

    const handleAllRead = () => {
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    };

    const handleUnreadCountUpdate = ({ count }: { count: number }) => {
      setUnreadCount(count);
    };

    socket.on('notification:new', handleNewNotification);
    socket.on('notification:read', handleNotificationRead);
    socket.on('notification:all-read', handleAllRead);
    socket.on('notification:unread-count', handleUnreadCountUpdate);

    return () => {
      socket.off('notification:new', handleNewNotification);
      socket.off('notification:read', handleNotificationRead);
      socket.off('notification:all-read', handleAllRead);
      socket.off('notification:unread-count', handleUnreadCountUpdate);
    };
  }, [socket]);

  const fetchUnreadCount = async () => {
    try {
      const response = await api.get('/notifications/unread/count');
      setUnreadCount(response.data.data.count);
    } catch (error) {
      console.error('Failed to fetch unread count:', error);
    }
  };

  const fetchNotifications = async (offset = 0) => {
    try {
      setLoading(true);
      const response = await api.get('/notifications', {
        params: { limit: 20, offset },
      });

      if (offset === 0) {
        // Initial load - limit to max
        const data = response.data.data.slice(0, MAX_NOTIFICATIONS_IN_MEMORY);
        setNotifications(data);
      } else {
        // Appending more - limit total size
        setNotifications((prev) => {
          const combined = [...prev, ...response.data.data];
          if (combined.length > MAX_NOTIFICATIONS_IN_MEMORY) {
            return combined.slice(0, MAX_NOTIFICATIONS_IN_MEMORY);
          }
          return combined;
        });
      }
      // Disable "load more" if we've hit the limit
      const currentLength = offset === 0
        ? response.data.data.length
        : notifications.length + response.data.data.length;
      setHasMore(response.data.pagination.hasMore && currentLength < MAX_NOTIFICATIONS_IN_MEMORY);
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (notificationId: string) => {
    try {
      await api.put(`/notifications/${notificationId}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.put('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    // Mark as read if unread
    if (!notification.is_read) {
      markAsRead(notification.id);
    }

    // Navigate to action URL if available
    if (notification.action_url) {
      // Check if it's an external URL or internal route
      if (notification.action_url.startsWith('http')) {
        window.open(notification.action_url, '_blank');
      } else {
        navigate(notification.action_url);
        setIsOpen(false);
      }
    } else if (notification.entity_type && notification.entity_id) {
      // Navigate based on entity type
      const routes: Record<string, string> = {
        task: `/tasks/${notification.entity_id}`,
        recording: `/record/${notification.entity_id}`,
        review: `/reviews/${notification.entity_id}`,
      };
      const route = routes[notification.entity_type];
      if (route) {
        navigate(route);
        setIsOpen(false);
      }
    }
  };

  const loadMore = () => {
    if (!loading && hasMore) {
      fetchNotifications(notifications.length);
    }
  };

  const getNotificationIcon = (type: string): string => {
    const icons: Record<string, string> = {
      task_assigned: '📋',
      review_comment: '💬',
      recording_ready: '🎬',
      task_due_soon: '⏰',
      task_overdue: '❗',
      recording_submitted: '📤',
      review_requested: '👀',
      review_completed: '✅',
      feedback_received: '📝',
      mention: '@',
      system: '🔔',
    };
    return icons[type] || '🔔';
  };

  const getPriorityColor = (priority: string): string => {
    const colors: Record<string, string> = {
      low: 'bg-gray-100',
      medium: 'bg-blue-50',
      high: 'bg-orange-50',
      urgent: 'bg-red-50',
    };
    return colors[priority] || 'bg-gray-100';
  };

  const formatTimeAgo = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label="View notifications"
        className="relative p-2 text-gray-400 hover:text-gray-500 hover:bg-gray-50 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500"
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unreadCount > 0 && (
          <span
            className="absolute top-0 right-0 transform translate-x-1/4 -translate-y-1/4 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-xs font-bold text-white bg-error-500 rounded-full ring-2 ring-white"
            aria-hidden="true"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          className="absolute right-0 z-50 mt-2 w-96 max-h-[70vh] origin-top-right bg-white rounded-xl shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none animate-fade-in overflow-hidden flex flex-col"
          role="menu"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h3 className="text-lg font-semibold text-gray-900">Notifications</h3>
            <div className="flex items-center space-x-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="flex items-center text-sm text-primary-600 hover:text-primary-700 transition-colors"
                  title="Mark all as read"
                >
                  <CheckCheck className="w-4 h-4 mr-1" />
                  Mark all read
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-500 rounded-full hover:bg-gray-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Connection status */}
          {!isConnected && (
            <div className="px-4 py-2 bg-yellow-50 border-b border-yellow-100">
              <p className="text-xs text-yellow-700">
                Connecting to real-time updates...
              </p>
            </div>
          )}

          {/* Notification list */}
          <div className="overflow-y-auto flex-1">
            {loading && notifications.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-500"></div>
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4">
                <Bell className="w-12 h-12 text-gray-300 mb-3" />
                <p className="text-gray-500 text-center">No notifications yet</p>
                <p className="text-gray-400 text-sm text-center mt-1">
                  We&apos;ll notify you when something important happens
                </p>
              </div>
            ) : (
              <>
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    className={`px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-b-0 transition-colors ${
                      !notification.is_read ? getPriorityColor(notification.priority) : ''
                    }`}
                    role="menuitem"
                  >
                    <div className="flex items-start space-x-3">
                      {/* Icon */}
                      <span className="text-lg flex-shrink-0 mt-0.5">
                        {getNotificationIcon(notification.type)}
                      </span>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between">
                          <p
                            className={`text-sm ${
                              notification.is_read ? 'text-gray-600' : 'text-gray-900 font-medium'
                            } line-clamp-1`}
                          >
                            {notification.title}
                          </p>
                          {!notification.is_read && (
                            <span className="ml-2 w-2 h-2 bg-primary-500 rounded-full flex-shrink-0 mt-1.5"></span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                          {notification.message}
                        </p>
                        <div className="flex items-center mt-1 space-x-2">
                          <span className="text-xs text-gray-400">
                            {formatTimeAgo(notification.created_at)}
                          </span>
                          {notification.action_url && (
                            <ExternalLink className="w-3 h-3 text-gray-400" />
                          )}
                        </div>
                      </div>

                      {/* Mark as read button (for unread only) */}
                      {!notification.is_read && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            markAsRead(notification.id);
                          }}
                          className="p-1 text-gray-400 hover:text-primary-500 rounded-full hover:bg-white transition-colors"
                          title="Mark as read"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {/* Load more button */}
                {hasMore && (
                  <div className="px-4 py-3 border-t border-gray-100">
                    <button
                      onClick={loadMore}
                      disabled={loading}
                      className="w-full py-2 text-sm text-primary-600 hover:text-primary-700 hover:bg-primary-50 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {loading ? 'Loading...' : 'Load more'}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-gray-100 bg-gray-50">
            <button
              onClick={() => {
                navigate('/profile');
                setIsOpen(false);
              }}
              className="w-full text-center text-sm text-gray-500 hover:text-primary-600 transition-colors"
            >
              Notification preferences
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationCenter;
