import React, { Component, ErrorInfo, ReactNode } from 'react';
import { captureException, addBreadcrumb, isSentryInitialized } from '../config/sentry';

/**
 * Error Boundary Component
 *
 * Catches JavaScript errors anywhere in the child component tree,
 * logs those errors, and displays a fallback UI.
 *
 * Features:
 * - Sentry integration for error reporting
 * - User-friendly error display
 * - Option to report issue
 * - Automatic recovery attempts
 * - Error context preservation
 */

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode | ((error: Error, resetError: () => void) => ReactNode);
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  showReportButton?: boolean;
  componentName?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  eventId: string | null;
  recoveryAttempts: number;
}

const MAX_RECOVERY_ATTEMPTS = 3;

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      eventId: null,
      recoveryAttempts: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log the error
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    // Add breadcrumb for context
    addBreadcrumb({
      message: `Error caught by ErrorBoundary: ${error.message}`,
      category: 'error-boundary',
      level: 'error',
      data: {
        componentName: this.props.componentName || 'Unknown',
        componentStack: errorInfo.componentStack,
      },
    });

    // Capture exception in Sentry
    const eventId = captureException(error, {
      extra: {
        componentStack: errorInfo.componentStack,
        componentName: this.props.componentName,
        recoveryAttempts: this.state.recoveryAttempts,
      },
      tags: {
        errorBoundary: 'true',
        ...(this.props.componentName && { component: this.props.componentName }),
      },
    });

    // Update state with error info
    this.setState({
      errorInfo,
      eventId: eventId || null,
    });

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  resetError = (): void => {
    const newRecoveryAttempts = this.state.recoveryAttempts + 1;

    if (newRecoveryAttempts >= MAX_RECOVERY_ATTEMPTS) {
      // Too many recovery attempts, suggest page reload
      addBreadcrumb({
        message: 'Max recovery attempts reached',
        category: 'error-boundary',
        level: 'warning',
        data: {
          recoveryAttempts: newRecoveryAttempts,
        },
      });
      return;
    }

    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      eventId: null,
      recoveryAttempts: newRecoveryAttempts,
    });
  };

  handleReportClick = (): void => {
    // Open Sentry feedback dialog if available
    if (isSentryInitialized() && this.state.eventId) {
      // Note: This requires Sentry feedback integration
      // For now, we'll just show an alert
      alert(`Error has been reported. Reference ID: ${this.state.eventId}`);
    } else {
      // Fallback: Copy error details to clipboard
      const errorDetails = {
        message: this.state.error?.message,
        stack: this.state.error?.stack,
        componentStack: this.state.errorInfo?.componentStack,
        timestamp: new Date().toISOString(),
      };

      navigator.clipboard
        .writeText(JSON.stringify(errorDetails, null, 2))
        .then(() => {
          alert('Error details copied to clipboard. Please share with support.');
        })
        .catch(() => {
          alert('Error has been logged. Please contact support if the issue persists.');
        });
    }
  };

  handleRefresh = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    const { hasError, error, recoveryAttempts } = this.state;
    const { children, fallback, showReportButton = true } = this.props;

    if (!hasError || !error) {
      return children;
    }

    // Use custom fallback if provided
    if (fallback) {
      if (typeof fallback === 'function') {
        return fallback(error, this.resetError);
      }
      return fallback;
    }

    // Default error UI
    return (
      <div className="min-h-[400px] flex items-center justify-center p-8">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 text-center">
          {/* Error icon */}
          <div className="w-16 h-16 mx-auto mb-4 text-red-500">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-16 h-16"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
          </div>

          {/* Error message */}
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Something went wrong
          </h2>
          <p className="text-gray-600 dark:text-gray-300 mb-4">
            We encountered an unexpected error. Our team has been notified.
          </p>

          {/* Error details (development only) */}
          {process.env.NODE_ENV === 'development' && (
            <div className="text-left bg-gray-100 dark:bg-gray-700 rounded p-3 mb-4 overflow-auto max-h-40">
              <p className="text-sm font-mono text-red-600 dark:text-red-400">
                {error.message}
              </p>
              {error.stack && (
                <pre className="text-xs text-gray-600 dark:text-gray-400 mt-2 whitespace-pre-wrap">
                  {error.stack.split('\n').slice(0, 5).join('\n')}
                </pre>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {recoveryAttempts < MAX_RECOVERY_ATTEMPTS ? (
              <button
                onClick={this.resetError}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                Try Again
              </button>
            ) : (
              <button
                onClick={this.handleRefresh}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                Refresh Page
              </button>
            )}

            {showReportButton && (
              <button
                onClick={this.handleReportClick}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-white rounded-md hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
              >
                Report Issue
              </button>
            )}
          </div>

          {/* Recovery attempts info */}
          {recoveryAttempts > 0 && recoveryAttempts < MAX_RECOVERY_ATTEMPTS && (
            <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
              Recovery attempt {recoveryAttempts} of {MAX_RECOVERY_ATTEMPTS}
            </p>
          )}

          {recoveryAttempts >= MAX_RECOVERY_ATTEMPTS && (
            <p className="mt-3 text-sm text-orange-600 dark:text-orange-400">
              Multiple recovery attempts failed. Please refresh the page.
            </p>
          )}
        </div>
      </div>
    );
  }
}

/**
 * Higher-order component to wrap components with error boundary
 */
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  errorBoundaryProps?: Omit<ErrorBoundaryProps, 'children'>
): React.FC<P> {
  const displayName = WrappedComponent.displayName || WrappedComponent.name || 'Component';

  const WithErrorBoundary: React.FC<P> = (props) => (
    <ErrorBoundary {...errorBoundaryProps} componentName={displayName}>
      <WrappedComponent {...props} />
    </ErrorBoundary>
  );

  WithErrorBoundary.displayName = `withErrorBoundary(${displayName})`;

  return WithErrorBoundary;
}

/**
 * Simple error fallback component for inline use
 */
interface ErrorFallbackProps {
  error: Error;
  resetError: () => void;
  title?: string;
  message?: string;
}

export const ErrorFallback: React.FC<ErrorFallbackProps> = ({
  error,
  resetError,
  title = 'Something went wrong',
  message = 'An error occurred while rendering this component.',
}) => (
  <div className="p-4 border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 rounded-lg">
    <h3 className="text-red-800 dark:text-red-200 font-medium">{title}</h3>
    <p className="text-red-600 dark:text-red-300 text-sm mt-1">{message}</p>
    {process.env.NODE_ENV === 'development' && (
      <p className="text-red-500 dark:text-red-400 text-xs mt-2 font-mono">{error.message}</p>
    )}
    <button
      onClick={resetError}
      className="mt-3 text-sm text-red-700 dark:text-red-300 underline hover:no-underline"
    >
      Try again
    </button>
  </div>
);

/**
 * Page-level error boundary with full-page fallback
 */
export const PageErrorBoundary: React.FC<{ children: ReactNode }> = ({ children }) => (
  <ErrorBoundary
    componentName="Page"
    fallback={(error, resetError) => (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-8">
        <div className="max-w-lg w-full bg-white dark:bg-gray-800 rounded-xl shadow-xl p-8 text-center">
          <div className="w-20 h-20 mx-auto mb-6 text-red-500">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-20 h-20"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
              />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
            Page Error
          </h1>
          <p className="text-gray-600 dark:text-gray-300 mb-6">
            We&apos;re sorry, but something went wrong loading this page.
            Our team has been notified and is working on a fix.
          </p>

          {process.env.NODE_ENV === 'development' && (
            <div className="text-left bg-gray-100 dark:bg-gray-700 rounded-lg p-4 mb-6 overflow-auto max-h-48">
              <p className="text-sm font-mono text-red-600 dark:text-red-400 break-words">
                {error.message}
              </p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={resetError}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Try Again
            </button>
            <button
              onClick={() => window.location.href = '/dashboard'}
              className="px-6 py-2.5 bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors font-medium"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    )}
  >
    {children}
  </ErrorBoundary>
);

/**
 * Sidebar error boundary - shows minimal fallback to keep main content usable
 */
export const SidebarErrorBoundary: React.FC<{ children: ReactNode }> = ({ children }) => (
  <ErrorBoundary
    componentName="Sidebar"
    showReportButton={false}
    fallback={(_error, resetError) => (
      <div className="w-72 h-full bg-gray-800 flex flex-col items-center justify-center p-4">
        <div className="text-gray-400 text-center">
          <svg
            className="w-8 h-8 mx-auto mb-2"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <p className="text-sm">Navigation unavailable</p>
          <button
            onClick={resetError}
            className="mt-2 text-xs text-blue-400 hover:text-blue-300 underline"
          >
            Reload
          </button>
        </div>
      </div>
    )}
  >
    {children}
  </ErrorBoundary>
);

/**
 * Main content error boundary - shows error in content area without breaking sidebar/header
 */
export const MainContentErrorBoundary: React.FC<{ children: ReactNode }> = ({ children }) => (
  <ErrorBoundary
    componentName="MainContent"
    fallback={(error, resetError) => (
      <div className="flex-1 flex items-center justify-center p-8 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 text-center">
          <div className="w-12 h-12 mx-auto mb-4 text-red-500">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-12 h-12"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Content Error
          </h2>
          <p className="text-gray-600 dark:text-gray-300 text-sm mb-4">
            Something went wrong loading this content.
          </p>
          {process.env.NODE_ENV === 'development' && (
            <p className="text-xs font-mono text-red-500 dark:text-red-400 mb-4 p-2 bg-gray-100 dark:bg-gray-700 rounded break-words">
              {error.message}
            </p>
          )}
          <button
            onClick={resetError}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    )}
  >
    {children}
  </ErrorBoundary>
);

/**
 * Section error boundary for wrapping specific sections like cards, tables, modals
 */
interface SectionErrorBoundaryProps {
  children: ReactNode;
  name: string;
  className?: string;
}

export const SectionErrorBoundary: React.FC<SectionErrorBoundaryProps> = ({
  children,
  name,
  className = '',
}) => (
  <ErrorBoundary
    componentName={name}
    showReportButton={false}
    fallback={(error, resetError) => (
      <div className={`flex items-center justify-center p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 ${className}`}>
        <div className="text-center">
          <p className="text-red-700 dark:text-red-300 text-sm font-medium mb-1">
            Failed to load {name.toLowerCase()}
          </p>
          {process.env.NODE_ENV === 'development' && (
            <p className="text-xs text-red-500 dark:text-red-400 mb-2 font-mono">
              {error.message}
            </p>
          )}
          <button
            onClick={resetError}
            className="text-xs text-red-600 dark:text-red-400 hover:underline"
          >
            Retry
          </button>
        </div>
      </div>
    )}
  >
    {children}
  </ErrorBoundary>
);

/**
 * Modal error boundary - prevents modal errors from crashing the page
 */
export const ModalErrorBoundary: React.FC<{ children: ReactNode; onClose?: () => void }> = ({
  children,
  onClose,
}) => (
  <ErrorBoundary
    componentName="Modal"
    fallback={(error, resetError) => (
      <div className="p-6 text-center">
        <div className="w-10 h-10 mx-auto mb-3 text-red-500">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-10 h-10"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
            />
          </svg>
        </div>
        <p className="text-gray-700 dark:text-gray-300 mb-4">
          Something went wrong with this dialog.
        </p>
        {process.env.NODE_ENV === 'development' && (
          <p className="text-xs font-mono text-red-500 mb-4 p-2 bg-gray-100 dark:bg-gray-700 rounded">
            {error.message}
          </p>
        )}
        <div className="flex gap-3 justify-center">
          <button
            onClick={resetError}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
          >
            Try Again
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="px-3 py-1.5 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 text-sm rounded hover:bg-gray-300 dark:hover:bg-gray-500"
            >
              Close
            </button>
          )}
        </div>
      </div>
    )}
  >
    {children}
  </ErrorBoundary>
);

export default ErrorBoundary;
