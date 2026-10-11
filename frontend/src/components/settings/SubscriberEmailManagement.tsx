import { useState, useEffect } from 'react';
import { Mail, CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import api from '../../services/api';

interface SubscriberEmailData {
  currentEmail: string;
  verifiedAt?: string;
  pendingEmail?: string;
  pendingVerifiedAt?: string;
  transferToken?: string;
}

interface TransferHistoryEntry {
  fromEmail: string;
  toEmail: string;
  status: 'completed' | 'pending' | 'cancelled';
  initiatedAt: string;
  completedAt?: string;
}

interface SubscriberEmailManagementProps {
  organizationId: string;
  userRole?: string;
}

const SubscriberEmailManagement = ({
  organizationId,
  userRole,
}: SubscriberEmailManagementProps) => {
  const [subscriberData, setSubscriberData] = useState<SubscriberEmailData | null>(null);
  const [transferHistory, setTransferHistory] = useState<TransferHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTransferForm, setShowTransferForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const isOwner = userRole === 'owner';

  // Suppress unused variable warning - error is set but display handled via message state
  void error;

  // Fetch subscriber email data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);

        const [subscriberRes, historyRes] = await Promise.allSettled([
          api.get(`/organizations/${organizationId}/subscriber-email`),
          api.get(`/organizations/${organizationId}/subscriber-email/history`),
        ]);

        if (subscriberRes.status === 'fulfilled') {
          setSubscriberData(subscriberRes.value.data?.data);
        }

        if (historyRes.status === 'fulfilled') {
          setTransferHistory(historyRes.value.data?.data || []);
        }
      } catch (err: any) {
        setError(err.response?.data?.error || err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [organizationId]);

  const handleInitiateTransfer = async () => {
    if (!newEmail) {
      setMessage({ type: 'error', text: 'Please enter an email address' });
      return;
    }

    if (newEmail === subscriberData?.currentEmail) {
      setMessage({ type: 'error', text: 'New email must be different from current email' });
      return;
    }

    try {
      setIsSubmitting(true);

      await api.post(`/organizations/${organizationId}/subscriber-email/transfer`, { newEmail });

      setMessage({
        type: 'success',
        text: `Verification email sent to ${newEmail}. Click the link to confirm the transfer.`,
      });
      setNewEmail('');
      setShowTransferForm(false);

      // Refresh data after a short delay
      setTimeout(async () => {
        try {
          const res = await api.get(`/organizations/${organizationId}/subscriber-email`);
          setSubscriberData(res.data?.data);
        } catch {
          // Silently fail on refresh
        }
      }, 1000);
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error.response?.data?.error || error.message || 'Failed to initiate transfer',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelTransfer = async () => {
    if (!confirm('Are you sure you want to cancel this transfer?')) {
      return;
    }

    try {
      await api.delete(`/organizations/${organizationId}/subscriber-email/transfer`);

      setMessage({ type: 'success', text: 'Transfer cancelled' });

      // Refresh data
      const updatedRes = await api.get(`/organizations/${organizationId}/subscriber-email`);
      setSubscriberData(updatedRes.data?.data);
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error.response?.data?.error || error.message || 'Failed to cancel transfer',
      });
    }
  };

  if (isLoading) {
    return <div className="text-center py-8">Loading subscriber email information...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Messages */}
      {message && (
        <div
          className={`p-4 rounded-lg text-sm ${
            message.type === 'success'
              ? 'bg-success-50 text-success-800'
              : 'bg-error-50 text-error-800'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Current Subscriber Email */}
      <Card className="p-6">
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Subscriber Email</h3>
            <p className="text-sm text-gray-600 mb-4">
              The email address associated with billing and critical organization notifications.
            </p>
          </div>

          {/* Current Email */}
          {subscriberData?.currentEmail && (
            <div className="p-4 bg-success-50 border border-success-200 rounded-lg flex items-start space-x-3">
              <CheckCircle className="w-6 h-6 text-success-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="font-semibold text-success-900">Current Subscriber Email</h4>
                <p className="text-sm text-success-800 mt-1 font-mono">
                  {subscriberData.currentEmail}
                </p>
                {subscriberData.verifiedAt && (
                  <p className="text-xs text-success-700 mt-1">
                    Verified on{' '}
                    {new Date(subscriberData.verifiedAt).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Pending Transfer */}
          {subscriberData?.pendingEmail && (
            <div className="p-4 bg-warning-50 border border-warning-200 rounded-lg flex items-start space-x-3">
              <AlertTriangle className="w-6 h-6 text-warning-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="font-semibold text-warning-900">Transfer in Progress</h4>
                <p className="text-sm text-warning-800 mt-1">
                  Waiting for verification of{' '}
                  <span className="font-mono">{subscriberData.pendingEmail}</span>
                </p>
                <p className="text-xs text-warning-700 mt-2">
                  Check your email for a verification link. This transfer will expire in 72 hours.
                </p>
              </div>
              {isOwner && (
                <Button variant="ghost" size="sm" onClick={handleCancelTransfer} className="mt-2">
                  Cancel Transfer
                </Button>
              )}
            </div>
          )}

          {/* Transfer Button */}
          {isOwner && !subscriberData?.pendingEmail && (
            <div className="flex justify-end">
              <Button
                variant="secondary"
                onClick={() => setShowTransferForm(!showTransferForm)}
                icon={<RefreshCw className="w-4 h-4" />}
              >
                Transfer Email
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* Transfer Form */}
      {showTransferForm && isOwner && (
        <Card className="border-primary-200 bg-primary-50">
          <div className="space-y-4">
            <h4 className="font-semibold text-gray-900">Transfer Subscriber Email</h4>

            <p className="text-sm text-gray-700">
              Enter the new email address for billing and notifications. A verification link will be
              sent to the new address.
            </p>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                New Email Address
              </label>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="newemail@example.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-600 mt-1">Must be a valid email address</p>
            </div>

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
              <p>
                <span className="font-semibold">What happens next:</span>
              </p>
              <ol className="mt-2 space-y-1 list-decimal list-inside">
                <li>A verification email will be sent to {newEmail || '[new email]'}</li>
                <li>Click the link in that email to confirm the transfer</li>
                <li>Once confirmed, all billing and notifications will use the new email</li>
              </ol>
            </div>

            <div className="flex space-x-3">
              <Button
                variant="primary"
                onClick={handleInitiateTransfer}
                disabled={isSubmitting || !newEmail}
              >
                {isSubmitting ? 'Sending...' : 'Send Verification Email'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setShowTransferForm(false);
                  setNewEmail('');
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Transfer History */}
      {transferHistory.length > 0 && (
        <Card className="p-6">
          <h4 className="text-lg font-semibold text-gray-900 mb-4">Transfer History</h4>

          <div className="space-y-3">
            {transferHistory.map((entry, idx) => {
              const statusColors =
                entry.status === 'completed'
                  ? 'bg-success-50 border-success-200 text-success-800'
                  : entry.status === 'pending'
                    ? 'bg-warning-50 border-warning-200 text-warning-800'
                    : 'bg-gray-50 border-gray-200 text-gray-800';

              return (
                <div
                  key={idx}
                  className={`p-4 border rounded-lg flex items-center justify-between ${statusColors}`}
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium">
                      {entry.fromEmail} → {entry.toEmail}
                    </p>
                    <p className="text-xs mt-1 opacity-75">
                      {new Date(entry.initiatedAt).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>

                  <span
                    className={`px-3 py-1 text-xs font-semibold rounded-full ${
                      entry.status === 'completed'
                        ? 'bg-success-200 text-success-900'
                        : entry.status === 'pending'
                          ? 'bg-warning-200 text-warning-900'
                          : 'bg-gray-200 text-gray-900'
                    }`}
                  >
                    {entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Info Box */}
      <Card className="bg-blue-50 border border-blue-200">
        <div className="flex items-start space-x-3">
          <Mail className="w-6 h-6 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold text-blue-900 mb-1">
              Why is the subscriber email important?
            </h4>
            <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
              <li>Receives billing invoices and payment notifications</li>
              <li>Receives critical security alerts</li>
              <li>Used for account recovery and support</li>
              <li>Only the owner can change this email</li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default SubscriberEmailManagement;
