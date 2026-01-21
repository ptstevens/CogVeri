import {
  Sparkles,
  Check,
  ArrowUp,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { useOrganization } from '../../contexts/OrganizationContext';
import { usePricingTiers, useCreateCheckout } from '../../hooks/useBilling';
import Button from '../ui/Button';
import Card from '../ui/Card';
import LoadingSpinner from '../ui/LoadingSpinner';

const PricingDisplay = () => {
  const { currentOrganization } = useOrganization();
  const { data: tiers, isLoading, error, refetch } = usePricingTiers();
  const createCheckout = useCreateCheckout();

  // Feature labels for display - expanded for better clarity
  const featureLabels: Record<string, string> = {
    removeWatermark: 'No Watermark',
    customThumbnails: 'Custom Thumbnails',
    downloadRecordings: 'Download Videos',
    hdRecording: 'HD Recording (1080p)',
    basicTranscription: 'Auto Transcription',
    advancedTranscription: 'Speaker Detection',
    aiSummaries: 'AI Summaries',
    timestampedComments: 'Timestamped Comments',
    reviewWorkflows: 'Review Workflows',
    teamWorkspaces: 'Team Workspaces',
    basicAnalytics: 'View Analytics',
    advancedAnalytics: 'Advanced Analytics',
    slackIntegration: 'Slack Integration',
    webhooks: 'Webhooks',
    apiAccess: 'API Access',
    customBranding: 'Custom Branding',
    customDomain: 'Custom Domain',
    ssoSaml: 'SSO/SAML',
    scimProvisioning: 'SCIM Provisioning',
    auditLogs: 'Audit Logs',
    advancedPermissions: 'Advanced Permissions',
    ipWhitelist: 'IP Whitelist',
    customDataRetention: 'Data Retention Policies',
    emailSupport: 'Email Support',
    prioritySupport: 'Priority Support',
    dedicatedCsm: 'Dedicated CSM',
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner message="Loading pricing information..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertTriangle className="w-12 h-12 text-error mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Failed to load pricing</h3>
        <p className="text-gray-600 mb-4">There was an error loading pricing information.</p>
        <Button variant="primary" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  if (!tiers || tiers.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No pricing tiers available.
      </div>
    );
  }

  // Filter out enterprise tier from main grid - it has its own special card
  const standardTiers = tiers.filter(tier => tier.name !== 'enterprise');

  const isCurrentTier = (tierName: string) => currentOrganization?.tier === tierName;

  const handleUpgrade = async (tierName: string) => {
    if (tierName === 'enterprise') {
      window.location.href = '/enterprise';
      return;
    }
    // Use checkout for upgrades
    await createCheckout.mutateAsync({ tierName, isAnnual: false });
  };

  const formatLimit = (limit: number): string => {
    if (limit === -1) return 'Unlimited';
    return limit.toString();
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Pricing Plans</h2>
        <p className="text-gray-600">
          Scale your skills verification and training assessment capabilities
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {standardTiers.map(tier => {
          const isCurrent = isCurrentTier(tier.name);

          return (
            <Card
              key={tier.name}
              className={`relative overflow-hidden transition ${
                isCurrent ? 'ring-2 ring-primary-500 shadow-lg' : ''
              } ${tier.highlighted ? 'border-primary-300' : ''}`}
            >
              {isCurrent && (
                <div className="absolute top-0 right-0 bg-primary-600 text-white px-3 py-1 text-xs font-semibold rounded-bl-lg">
                  Current Plan
                </div>
              )}

              {tier.highlighted && !isCurrent && (
                <div className="absolute top-0 right-0 bg-primary-500 text-white px-3 py-1 text-xs font-semibold rounded-bl-lg">
                  Popular
                </div>
              )}

              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xl font-bold text-gray-900">{tier.displayName}</h3>
                  {tier.highlighted && (
                    <Sparkles className="w-5 h-5 text-primary-600" />
                  )}
                </div>
                <div className="flex items-baseline">
                  {tier.monthlyPrice === 0 ? (
                    <span className="text-4xl font-bold text-gray-900">Free</span>
                  ) : (
                    <>
                      <span className="text-4xl font-bold text-gray-900">${tier.monthlyPrice}</span>
                      <span className="text-gray-600 ml-2">/month</span>
                    </>
                  )}
                </div>
                {tier.description && (
                  <p className="text-sm text-gray-500 mt-2">{tier.description}</p>
                )}
              </div>

              <div className="mb-6 pb-6 border-b border-gray-200">
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center text-gray-700">
                    <span className="w-4 h-4 mr-2">👥</span>
                    {formatLimit(tier.limits.maxMembers)} platform seats
                  </li>
                  <li className="flex items-center text-purple-700 font-medium">
                    <span className="w-4 h-4 mr-2">✨</span>
                    Unlimited magic link submissions
                  </li>
                  <li className="flex items-center text-gray-700">
                    <span className="w-4 h-4 mr-2">💾</span>
                    {formatLimit(tier.limits.maxStorageGb)}GB storage
                  </li>
                  <li className="flex items-center text-gray-700">
                    <span className="w-4 h-4 mr-2">📋</span>
                    {formatLimit(tier.limits.maxTasksPerMonth)} tasks/month
                  </li>
                  <li className="flex items-center text-gray-700">
                    <span className="w-4 h-4 mr-2">🎥</span>
                    {formatLimit(tier.limits.maxVideosPerMonth)} videos/month
                  </li>
                </ul>
              </div>

              <div className="mb-6">
                <h4 className="text-sm font-semibold text-gray-900 mb-3">Features</h4>
                <ul className="space-y-2">
                  {Object.entries(tier.features).map(([feature, included]) => (
                    <li key={feature} className="flex items-start">
                      {included ? (
                        <Check className="w-5 h-5 text-success-600 mr-2 flex-shrink-0 mt-0.5" />
                      ) : (
                        <div className="w-5 h-5 border border-gray-300 rounded mr-2 mt-0.5" />
                      )}
                      <span className={`text-sm ${included ? 'text-gray-700' : 'text-gray-400'}`}>
                        {featureLabels[feature] || feature}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {!isCurrent && tier.name !== 'free' && (
                <Button
                  variant={tier.highlighted ? 'primary' : 'secondary'}
                  fullWidth
                  onClick={() => handleUpgrade(tier.name)}
                  isLoading={createCheckout.isPending}
                >
                  {tier.ctaText || `Upgrade to ${tier.displayName}`}
                </Button>
              )}

              {isCurrent && tier.name === 'free' && (
                <Button
                  variant="primary"
                  fullWidth
                  icon={<ArrowUp className="w-4 h-4" />}
                  onClick={() => window.location.href = '/settings/billing'}
                >
                  Upgrade Plan
                </Button>
              )}

              {isCurrent && tier.name !== 'free' && (
                <Button
                  variant="secondary"
                  fullWidth
                  onClick={() => window.location.href = '/settings/billing'}
                >
                  Manage Subscription
                </Button>
              )}
            </Card>
          );
        })}
      </div>

      <Card className={`bg-gradient-to-r from-gray-900 to-gray-800 border-0 ${isCurrentTier('enterprise') ? 'ring-2 ring-primary-500' : ''}`}>
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-4">
            <div className="text-2xl">🏢</div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-white">Enterprise</h3>
                {isCurrentTier('enterprise') && (
                  <span className="bg-primary-500 text-white text-xs px-2 py-0.5 rounded-full font-medium">
                    Current Plan
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-300 mb-1">
                For large organizations with custom needs
              </p>
              <p className="text-lg font-semibold text-white mb-2">
                Custom Pricing
              </p>
              <ul className="text-xs text-gray-400 space-y-1 mb-3">
                <li>✓ Unlimited team members</li>
                <li>✓ Unlimited storage</li>
                <li>✓ Dedicated Customer Success Manager</li>
                <li>✓ Custom SLA & security review</li>
                <li>✓ Invoice billing available</li>
              </ul>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <a
              href="mailto:sales@cogveri.com"
              className="inline-flex items-center text-white bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg font-medium text-sm transition whitespace-nowrap"
            >
              Contact Sales →
            </a>
            {isCurrentTier('enterprise') && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => window.location.href = '/settings/billing'}
              >
                Manage Subscription
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
};

export default PricingDisplay;
