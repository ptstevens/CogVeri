import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Clock, CreditCard, Mail, LogOut } from 'lucide-react';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import { storageService } from '../../services/storage.service';

interface SuspensionData {
  reason?: string;
  suspendedAt?: string;
  scheduledDeletionAt?: string;
  organizationName?: string;
}

const AccountSuspended = () => {
  const [suspensionData, setSuspensionData] = useState<SuspensionData>({});
  const [daysUntilDeletion, setDaysUntilDeletion] = useState<number | null>(null);

  useEffect(() => {
    // Load suspension data from session storage
    const storedData = sessionStorage.getItem('suspension_data');
    if (storedData) {
      try {
        const data = JSON.parse(storedData) as SuspensionData;
        setSuspensionData(data);

        // Calculate days until deletion
        if (data.scheduledDeletionAt) {
          const deletionDate = new Date(data.scheduledDeletionAt);
          const now = new Date();
          const diffTime = deletionDate.getTime() - now.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          setDaysUntilDeletion(Math.max(0, diffDays));
        }
      } catch {
        // Invalid JSON, ignore
      }
    }
  }, []);

  const handleLogout = () => {
    storageService.clearAuth();
    sessionStorage.removeItem('suspension_data');
    window.location.href = '/login';
  };

  const getReasonMessage = (reason?: string) => {
    switch (reason) {
      case 'trial_expired':
        return 'Your free trial has ended.';
      case 'payment_failed':
        return 'There was an issue processing your payment.';
      case 'admin_action':
        return 'Your account has been suspended by an administrator.';
      default:
        return 'Your account has been suspended.';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-navy via-brand-navy-dark to-brand-navy flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-amber-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-red-500/5 rounded-full blur-3xl" />
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-lg relative z-10">
        <div className="flex justify-center mb-6">
          <div className="bg-amber-500/20 p-4 rounded-full">
            <AlertTriangle className="w-12 h-12 text-amber-400" />
          </div>
        </div>

        <Card className="py-8 px-6 sm:px-10 shadow-2xl border-amber-500/20">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900">
              Account Suspended
            </h1>
            {suspensionData.organizationName && (
              <p className="mt-1 text-gray-600">
                {suspensionData.organizationName}
              </p>
            )}
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-amber-800 font-medium">
                  {getReasonMessage(suspensionData.reason)}
                </p>
                <p className="text-amber-700 text-sm mt-1">
                  Your data is safe and will be preserved while you decide on your next steps.
                </p>
              </div>
            </div>
          </div>

          {daysUntilDeletion !== null && daysUntilDeletion > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <div className="flex items-start gap-3">
                <Clock className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-red-800 font-medium">
                    {daysUntilDeletion} days until account deletion
                  </p>
                  <p className="text-red-700 text-sm mt-1">
                    Subscribe to a plan before this date to keep your data and regain access.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div className="text-center">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">
                What would you like to do?
              </h2>
            </div>

            <Link to="/reactivate">
              <Button fullWidth className="bg-primary-600 hover:bg-primary-700">
                <CreditCard className="w-4 h-4 mr-2" />
                Subscribe to Reactivate
              </Button>
            </Link>

            <a
              href="mailto:support@cogveri.com?subject=Account Suspended Help"
              className="flex items-center justify-center gap-2 w-full py-2.5 px-4 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition"
            >
              <Mail className="w-4 h-4" />
              Contact Support
            </a>

            <button
              onClick={handleLogout}
              className="flex items-center justify-center gap-2 w-full py-2.5 px-4 text-gray-500 hover:text-gray-700 transition"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>

          <div className="mt-6 pt-6 border-t border-gray-200">
            <p className="text-sm text-gray-500 text-center">
              Need to export your data? <a href="mailto:support@cogveri.com" className="text-primary-600 hover:underline">Contact us</a> and we'll help you retrieve it before your account is deleted.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default AccountSuspended;
