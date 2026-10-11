import { useState, useEffect } from 'react';
import { CheckCircle, AlertTriangle, Copy, Shield, Users, Ban } from 'lucide-react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import api from '../../services/api';

interface DomainVerificationStatus {
  domain: string;
  verified: boolean;
  verifiedAt?: string;
  method?: 'email' | 'dns';
  pendingVerificationId?: string;
  pendingMethod?: 'email' | 'dns';
}

interface DomainClaimingStatus {
  tier: string;
  isMultiMemberTier: boolean;
  domain: string | null;
  suggestedDomain: string | null;
  domainVerified: boolean;
  canClaimDomain: boolean;
  canInstantClaim: boolean;
  claimBlockedReason?: string;
}

interface DomainManagementProps {
  organizationId: string;
  currentDomain?: string;
  verificationStatus?: DomainVerificationStatus;
  /** Organization name for display in CTA */
  organizationName?: string;
}

const DomainManagement = ({
  organizationId,
  currentDomain,
  verificationStatus,
  organizationName,
}: DomainManagementProps) => {
  const [showVerificationForm, setShowVerificationForm] = useState(false);
  const [verificationMethod, setVerificationMethod] = useState<'email' | 'dns'>('email');
  const [domain, setDomain] = useState(currentDomain || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [claimingStatus, setClaimingStatus] = useState<DomainClaimingStatus | null>(null);
  const [loadingClaimStatus, setLoadingClaimStatus] = useState(true);

  // Suppress unused variable warning - organizationName is a prop for future use
  void organizationName;

  // Fetch domain claiming status on mount
  useEffect(() => {
    const fetchClaimingStatus = async () => {
      try {
        const response = await api.get(`/domain-verification/claiming-status/${organizationId}`);
        setClaimingStatus(response.data?.data);
        // Pre-fill domain if suggested
        if (response.data?.data?.suggestedDomain && !domain) {
          setDomain(response.data.data.suggestedDomain);
        }
      } catch (error) {
        console.error('Failed to fetch domain claiming status:', error);
      } finally {
        setLoadingClaimStatus(false);
      }
    };

    fetchClaimingStatus();
  }, [organizationId]);

  // Handler for "Claim Domain" CTA button - if instant claim available, use it
  const handleStartClaim = () => {
    if (claimingStatus?.canInstantClaim && claimingStatus?.suggestedDomain) {
      // Instant claim available - claim directly without verification
      handleInstantClaim();
    } else {
      // Fall back to verification form
      if (claimingStatus?.suggestedDomain) {
        setDomain(claimingStatus.suggestedDomain);
      }
      setShowVerificationForm(true);
    }
  };

  // Instant claim - no verification needed when email domain matches
  const handleInstantClaim = async () => {
    if (!claimingStatus?.suggestedDomain) return;

    try {
      setIsSubmitting(true);
      setMessage(null);

      const response = await api.post('/domain-verification/instant-claim', {
        organizationId,
        domain: claimingStatus.suggestedDomain,
      });

      if (response.data?.success) {
        setMessage({
          type: 'success',
          text: response.data.data?.message || 'Domain claimed successfully',
        });
        // Refresh claiming status
        setClaimingStatus((prev) =>
          prev
            ? {
                ...prev,
                domainVerified: true,
                canClaimDomain: false,
                canInstantClaim: false,
                domain: claimingStatus.suggestedDomain,
              }
            : null
        );
      } else {
        setMessage({ type: 'error', text: response.data?.error || 'Failed to claim domain' });
      }
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error.response?.data?.error || error.message || 'Failed to claim domain',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRequestVerification = async () => {
    if (!domain) {
      setMessage({ type: 'error', text: 'Please enter a domain' });
      return;
    }

    try {
      setIsSubmitting(true);

      const endpoint =
        verificationMethod === 'email'
          ? '/domain-verification/request-email'
          : '/domain-verification/request-dns';

      await api.post(endpoint, {
        organizationId,
        domain,
      });

      setMessage({
        type: 'success',
        text: `Verification request sent! Check your ${verificationMethod === 'email' ? 'email' : 'DNS records'}.`,
      });
      setShowVerificationForm(false);
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error.response?.data?.error || error.message || 'Failed to request verification',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setMessage({ type: 'success', text: 'Copied to clipboard!' });
  };

  return (
    <div className="space-y-6">
      {/* Success/Error Message - shown after actions */}
      {message && !showVerificationForm && (
        <div
          className={`p-4 rounded-lg text-sm ${
            message.type === 'success'
              ? 'bg-success-50 text-success-800 border border-success-200'
              : 'bg-error-50 text-error-800 border border-error-200'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Claim Your Domain CTA - for paid tiers without verified domain */}
      {!loadingClaimStatus && claimingStatus?.canClaimDomain && !showVerificationForm && (
        <Card className="border-primary-200 bg-gradient-to-br from-primary-50 to-blue-50">
          <div className="p-2">
            <div className="flex items-start space-x-4">
              <div className="p-3 bg-primary-100 rounded-full flex-shrink-0">
                <Shield className="w-8 h-8 text-primary-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-xl font-bold text-gray-900 mb-3">
                  Claim Your Organization's Domain
                </h3>
                <p className="text-sm text-gray-600 mb-4 leading-relaxed">
                  As a <span className="font-semibold capitalize">{claimingStatus.tier}</span>{' '}
                  subscriber, you can claim{' '}
                  <span className="font-semibold text-primary-700">
                    @{claimingStatus.suggestedDomain}
                  </span>
                  . This prevents others from creating separate accounts and ensures all team
                  members join your organization.
                </p>

                {/* Benefits */}
                <div className="flex flex-wrap gap-4 mb-5">
                  <div className="flex items-center text-sm text-gray-700">
                    <Users className="w-4 h-4 text-primary-500 mr-2 flex-shrink-0" />
                    <span>New users auto-join your org</span>
                  </div>
                  <div className="flex items-center text-sm text-gray-700">
                    <Ban className="w-4 h-4 text-primary-500 mr-2 flex-shrink-0" />
                    <span>Block duplicate organizations</span>
                  </div>
                </div>

                <Button
                  variant="primary"
                  size="lg"
                  onClick={handleStartClaim}
                  disabled={isSubmitting}
                >
                  <Shield className="w-4 h-4 mr-2" />
                  {isSubmitting
                    ? 'Claiming...'
                    : claimingStatus.canInstantClaim
                      ? `Claim @${claimingStatus.suggestedDomain} Now`
                      : `Claim @${claimingStatus.suggestedDomain}`}
                </Button>
                {claimingStatus.canInstantClaim && (
                  <p className="text-xs text-green-600 mt-2">
                    ✓ Your email matches this domain — instant claim available!
                  </p>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Block reason notice */}
      {!loadingClaimStatus && claimingStatus?.claimBlockedReason && (
        <Card className="border-warning-200 bg-warning-50">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="w-6 h-6 text-warning-600 flex-shrink-0" />
            <div>
              <h4 className="font-semibold text-warning-900">Cannot Claim Domain</h4>
              <p className="text-sm text-warning-800 mt-1">{claimingStatus.claimBlockedReason}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Domain Verified Status - show when domain is claimed/verified */}
      {!loadingClaimStatus &&
        (claimingStatus?.domainVerified || verificationStatus?.verified) &&
        !showVerificationForm && (
          <Card className="p-6">
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Domain Status</h3>
              </div>
              <div className="p-4 bg-success-50 border border-success-200 rounded-lg flex items-start space-x-3">
                <CheckCircle className="w-6 h-6 text-success-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-semibold text-success-900">Domain Claimed</h4>
                  <p className="text-sm text-success-800 mt-1 font-medium">
                    @{claimingStatus?.domain || verificationStatus?.domain}
                  </p>
                  <p className="text-xs text-success-700 mt-2">
                    New users with this email domain will be directed to join your organization.
                  </p>
                  {verificationStatus?.verifiedAt && (
                    <p className="text-xs text-success-600 mt-1">
                      Verified on{' '}
                      {new Date(verificationStatus.verifiedAt).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </Card>
        )}

      {/* Domain Verification Section - Only show when NOT displaying the claim CTA and not already verified */}
      {!loadingClaimStatus &&
        !claimingStatus?.domainVerified &&
        !verificationStatus?.verified &&
        (!claimingStatus?.canClaimDomain || showVerificationForm) && (
          <Card className="p-6">
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Domain Verification</h3>
                <p className="text-sm text-gray-600">
                  Verify your organization's domain to enable auto-provisioning of team members with
                  matching email addresses.
                </p>
              </div>

              {verificationStatus?.pendingVerificationId && !verificationStatus?.verified && (
                <div className="p-4 bg-warning-50 border border-warning-200 rounded-lg flex items-start space-x-3">
                  <AlertTriangle className="w-6 h-6 text-warning-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-semibold text-warning-900">Verification Pending</h4>
                    <p className="text-sm text-warning-800 mt-1">{verificationStatus.domain}</p>
                    <p className="text-xs text-warning-700 mt-1">
                      Method: {verificationStatus.pendingMethod === 'email' ? 'Email' : 'DNS'}
                    </p>
                  </div>
                </div>
              )}

              {!verificationStatus?.verified &&
                !verificationStatus?.pendingVerificationId &&
                !showVerificationForm && (
                  <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                    <p className="text-sm text-gray-600">No domain verified yet</p>
                    {!claimingStatus?.isMultiMemberTier && (
                      <p className="text-xs text-gray-500 mt-1">
                        Upgrade to a paid plan to claim your domain and block duplicate signups.
                      </p>
                    )}
                  </div>
                )}
            </div>
          </Card>
        )}

      {/* Verification Form */}
      {showVerificationForm && (
        <Card className="border-primary-200 bg-primary-50">
          <div className="space-y-4">
            <h4 className="font-semibold text-gray-900">Add or Change Domain</h4>

            {/* Domain Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Domain</label>
              <input
                type="text"
                value={domain}
                onChange={(e) => setDomain(e.target.value.toLowerCase())}
                placeholder="example.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-600 mt-1">
                Enter your domain without https:// or www.
              </p>
            </div>

            {/* Verification Method Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Verification Method
              </label>
              <div className="space-y-2">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    name="method"
                    value="email"
                    checked={verificationMethod === 'email'}
                    onChange={() => setVerificationMethod('email')}
                    className="w-4 h-4 text-primary-600"
                  />
                  <span className="ml-2 text-sm text-gray-700">
                    Email (admin@{domain || 'example.com'})
                  </span>
                </label>
                <label className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    name="method"
                    value="dns"
                    checked={verificationMethod === 'dns'}
                    onChange={() => setVerificationMethod('dns')}
                    className="w-4 h-4 text-primary-600"
                  />
                  <span className="ml-2 text-sm text-gray-700">DNS (add TXT record)</span>
                </label>
              </div>
              <p className="text-xs text-gray-600 mt-2">
                {verificationMethod === 'email'
                  ? "We'll send a verification code to admin@your-domain.com"
                  : 'Add a TXT record to your domain to verify ownership'}
              </p>
            </div>

            {/* Messages */}
            {message && (
              <div
                className={`p-3 rounded-lg text-sm ${
                  message.type === 'success'
                    ? 'bg-success-50 text-success-800'
                    : 'bg-error-50 text-error-800'
                }`}
              >
                {message.text}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex space-x-3">
              <Button
                variant="primary"
                onClick={handleRequestVerification}
                disabled={isSubmitting || !domain}
              >
                {isSubmitting ? 'Sending...' : 'Request Verification'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setShowVerificationForm(false);
                  setMessage(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* DNS Instructions (if DNS method was selected) */}
      {verificationMethod === 'dns' && showVerificationForm && (
        <Card className="border-blue-200 bg-blue-50">
          <div className="space-y-3">
            <h4 className="font-semibold text-gray-900">DNS Verification Instructions</h4>
            <ol className="space-y-2 text-sm text-gray-700 list-decimal list-inside">
              <li>Log in to your domain registrar (GoDaddy, Namecheap, etc.)</li>
              <li>Find the DNS or TXT records section</li>
              <li>Add a new TXT record with the following values:</li>
            </ol>

            <div className="space-y-2 mt-3 bg-white p-3 rounded border border-blue-200">
              <div>
                <label className="text-xs font-semibold text-gray-700">Name (Host)</label>
                <div className="flex items-center space-x-2 mt-1">
                  <code className="flex-1 text-xs bg-gray-100 p-2 rounded font-mono">
                    _verification.{domain || 'example.com'}
                  </code>
                  <button
                    onClick={() => copyToClipboard(`_verification.${domain || 'example.com'}`)}
                    className="p-2 hover:bg-blue-100 rounded"
                  >
                    <Copy className="w-4 h-4 text-gray-600" />
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700">Value</label>
                <div className="flex items-center space-x-2 mt-1">
                  <code className="flex-1 text-xs bg-gray-100 p-2 rounded font-mono truncate">
                    cogveri-verification=XXXXXXXXXXXX
                  </code>
                  <button
                    onClick={() => copyToClipboard('cogveri-verification=XXXXXXXXXXXX')}
                    className="p-2 hover:bg-blue-100 rounded"
                  >
                    <Copy className="w-4 h-4 text-gray-600" />
                  </button>
                </div>
              </div>
            </div>

            <p className="text-xs text-gray-600 mt-2">
              DNS changes can take 24-48 hours to propagate. We will automatically verify once the
              record is found.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
};

export default DomainManagement;
