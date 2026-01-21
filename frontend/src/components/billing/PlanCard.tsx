import { Check, Sparkles, Crown, ArrowRight } from 'lucide-react';
import Button from '../ui/Button';
import { PricingTier } from '../../services/billing.api';

export interface PlanCardProps {
  tier: PricingTier;
  isCurrent: boolean;
  isAnnual?: boolean;
  onSelect: (tier: PricingTier) => void;
  isLoading?: boolean;
  showFeatures?: boolean;
  compact?: boolean;
}

const PlanCard = ({
  tier,
  isCurrent,
  isAnnual = true,
  onSelect,
  isLoading = false,
  showFeatures = true,
}: PlanCardProps) => {
  const price = isAnnual ? Math.round(tier.yearlyPrice / 12) : tier.monthlyPrice;
  const isHighlighted = tier.highlighted;
  const isEnterprise = tier.name === 'enterprise';

  const formatLimit = (value: number, unit: string): string => {
    if (value === -1) return 'Unlimited';
    return `${value.toLocaleString()}${unit ? ` ${unit}` : ''}`;
  };

  const getFeaturesList = () => {
    const enabledFeatures: string[] = [];
    const featureLabels: Record<string, string> = {
      removeWatermark: 'No watermark',
      customThumbnails: 'Custom thumbnails',
      downloadRecordings: 'Download videos',
      hdRecording: 'HD recording (1080p)',
      basicTranscription: 'Auto transcription',
      advancedTranscription: 'Speaker detection',
      aiSummaries: 'AI summaries',
      timestampedComments: 'Timestamped comments',
      reviewWorkflows: 'Review workflows',
      teamWorkspaces: 'Team workspaces',
      basicAnalytics: 'Basic analytics',
      advancedAnalytics: 'Advanced analytics',
      slackIntegration: 'Slack integration',
      webhooks: 'Webhooks',
      apiAccess: 'API access',
      customBranding: 'Custom branding',
      customDomain: 'Custom domain',
      ssoSaml: 'SSO/SAML',
      scimProvisioning: 'SCIM provisioning',
      auditLogs: 'Audit logs',
      advancedPermissions: 'Advanced permissions',
      ipWhitelist: 'IP whitelist',
      customDataRetention: 'Custom data retention',
      emailSupport: 'Email support',
      prioritySupport: 'Priority support',
      dedicatedCsm: 'Dedicated CSM',
    };

    for (const [key, enabled] of Object.entries(tier.features)) {
      if (enabled && featureLabels[key]) {
        enabledFeatures.push(featureLabels[key]);
      }
    }

    return enabledFeatures.slice(0, 6);
  };

  // Determine card styling based on state
  const getCardClasses = () => {
    const baseClasses =
      'relative rounded-2xl p-6 transition-all duration-300 flex flex-col h-full';

    if (isHighlighted) {
      return `${baseClasses} bg-gradient-to-br from-primary-600 via-primary-600 to-primary-700 text-white shadow-xl shadow-primary-500/25 scale-[1.02] z-10 ring-2 ring-primary-400/50`;
    }

    if (isCurrent) {
      return `${baseClasses} bg-white border-2 border-primary-400 shadow-lg shadow-primary-100`;
    }

    return `${baseClasses} bg-white border border-gray-200 hover:border-gray-300 hover:shadow-lg hover:-translate-y-1`;
  };

  return (
    <div className={getCardClasses()}>
      {/* Popular Badge */}
      {isHighlighted && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-accent-400 to-accent-500 px-4 py-1.5 text-sm font-bold text-white shadow-lg shadow-accent-500/30">
            <Sparkles className="w-4 h-4" />
            Most Popular
          </span>
        </div>
      )}

      {/* Current Plan Badge */}
      {isCurrent && !isHighlighted && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="inline-flex items-center rounded-full bg-primary-600 px-4 py-1 text-sm font-semibold text-white shadow-md">
            Current Plan
          </span>
        </div>
      )}

      {/* Header */}
      <div className="text-center mb-6 pt-2">
        <div className="flex items-center justify-center gap-2 mb-2">
          {isEnterprise && (
            <Crown
              className={`w-5 h-5 ${isHighlighted ? 'text-accent-300' : 'text-accent-500'}`}
            />
          )}
          <h3
            className={`text-xl font-bold ${isHighlighted ? 'text-white' : 'text-gray-900'}`}
          >
            {tier.displayName}
          </h3>
        </div>
        <p
          className={`text-sm leading-relaxed ${
            isHighlighted ? 'text-primary-100' : 'text-gray-500'
          }`}
        >
          {tier.description}
        </p>
      </div>

      {/* Pricing */}
      <div className="text-center mb-6">
        {isEnterprise ? (
          <div
            className={`text-lg font-semibold ${isHighlighted ? 'text-white' : 'text-gray-700'}`}
          >
            Custom pricing
          </div>
        ) : (
          <div>
            <div className="flex items-baseline justify-center gap-1">
              <span
                className={`text-4xl font-extrabold tracking-tight ${
                  isHighlighted ? 'text-white' : 'text-gray-900'
                }`}
              >
                ${price}
              </span>
              <span
                className={`text-sm font-medium ${
                  isHighlighted ? 'text-primary-200' : 'text-gray-500'
                }`}
              >
                /mo
              </span>
            </div>
            {isAnnual && tier.monthlyPrice > 0 && (
              <p
                className={`text-xs mt-1.5 ${
                  isHighlighted ? 'text-primary-200' : 'text-gray-400'
                }`}
              >
                Billed annually at ${tier.yearlyPrice}/year
              </p>
            )}
            {!isAnnual && tier.monthlyPrice > 0 && (
              <p
                className={`text-xs mt-1.5 ${
                  isHighlighted ? 'text-primary-200' : 'text-gray-400'
                }`}
              >
                per user, billed monthly
              </p>
            )}
          </div>
        )}
      </div>

      {/* Limits Section */}
      <div
        className={`mb-6 pb-5 border-b ${
          isHighlighted ? 'border-primary-500/50' : 'border-gray-100'
        }`}
      >
        <div className="grid grid-cols-2 gap-3">
          <div
            className={`text-center p-2.5 rounded-lg ${
              isHighlighted ? 'bg-primary-500/30' : 'bg-gray-50'
            }`}
          >
            <div
              className={`text-lg font-bold ${isHighlighted ? 'text-white' : 'text-gray-900'}`}
            >
              {formatLimit(tier.limits.maxMembers, '')}
            </div>
            <div
              className={`text-xs ${isHighlighted ? 'text-primary-200' : 'text-gray-500'}`}
            >
              Team members
            </div>
          </div>
          <div
            className={`text-center p-2.5 rounded-lg ${
              isHighlighted ? 'bg-primary-500/30' : 'bg-gray-50'
            }`}
          >
            <div
              className={`text-lg font-bold ${isHighlighted ? 'text-white' : 'text-gray-900'}`}
            >
              {formatLimit(tier.limits.maxStorageGb, 'GB')}
            </div>
            <div
              className={`text-xs ${isHighlighted ? 'text-primary-200' : 'text-gray-500'}`}
            >
              Storage
            </div>
          </div>
          <div
            className={`text-center p-2.5 rounded-lg ${
              isHighlighted ? 'bg-primary-500/30' : 'bg-gray-50'
            }`}
          >
            <div
              className={`text-lg font-bold ${isHighlighted ? 'text-white' : 'text-gray-900'}`}
            >
              {formatLimit(tier.limits.maxVideosPerMonth, '')}
            </div>
            <div
              className={`text-xs ${isHighlighted ? 'text-primary-200' : 'text-gray-500'}`}
            >
              Videos/mo
            </div>
          </div>
          <div
            className={`text-center p-2.5 rounded-lg ${
              isHighlighted ? 'bg-primary-500/30' : 'bg-gray-50'
            }`}
          >
            <div
              className={`text-lg font-bold ${isHighlighted ? 'text-white' : 'text-gray-900'}`}
            >
              {formatLimit(tier.limits.maxTasksPerMonth, '')}
            </div>
            <div
              className={`text-xs ${isHighlighted ? 'text-primary-200' : 'text-gray-500'}`}
            >
              Tasks/mo
            </div>
          </div>
        </div>
      </div>

      {/* Features List */}
      {showFeatures && (
        <div className="mb-6 flex-grow">
          <ul className="space-y-2.5">
            {getFeaturesList().map((feature, idx) => (
              <li key={idx} className="flex items-start gap-2.5">
                <div
                  className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5 ${
                    isHighlighted ? 'bg-primary-400/30' : 'bg-success-50'
                  }`}
                >
                  <Check
                    className={`w-3 h-3 ${
                      isHighlighted ? 'text-white' : 'text-success-600'
                    }`}
                  />
                </div>
                <span
                  className={`text-sm ${isHighlighted ? 'text-white' : 'text-gray-700'}`}
                >
                  {feature}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* CTA Button */}
      <div className="mt-auto">
        {isCurrent ? (
          <button
            disabled
            className={`w-full py-3 px-4 rounded-xl font-semibold text-sm transition-all ${
              isHighlighted
                ? 'bg-white/20 text-white/80 cursor-not-allowed'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            Current Plan
          </button>
        ) : (
          <Button
            variant={isHighlighted ? 'secondary' : 'primary'}
            fullWidth
            isLoading={isLoading}
            onClick={() => onSelect(tier)}
            className={`py-3 rounded-xl font-semibold text-sm group ${
              isHighlighted
                ? 'bg-white text-primary-600 hover:bg-gray-50 shadow-lg'
                : 'bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 shadow-md shadow-primary-500/20'
            }`}
          >
            <span className="flex items-center justify-center gap-2">
              {isEnterprise ? 'Contact Sales' : tier.ctaText || `Get ${tier.displayName}`}
              {!isEnterprise && (
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
              )}
            </span>
          </Button>
        )}
      </div>
    </div>
  );
};

export default PlanCard;
