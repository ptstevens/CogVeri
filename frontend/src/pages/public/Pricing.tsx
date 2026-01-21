import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Check,
  X,
  Zap,
  Users,
  Video,
  Shield,
  MessageSquare,
  BarChart3,
  ArrowRight,
  HelpCircle,
} from 'lucide-react';
import { PublicNav } from '../../components/layout/PublicNav';
import { featureFlags } from '../../config/featureFlags';
import { COMING_SOON_BANNER_HEIGHT } from '../../components/ui/ComingSoonBanner';

/**
 * Pricing tier interface matching backend structure
 */
interface PricingTier {
  id: string;
  name: string;
  displayName: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  limits: {
    maxMembers: number;
    maxStorageGb: number;
    maxTasksPerMonth: number;
    maxVideosPerMonth: number;
    maxVideoLengthMinutes: number;
    maxExternalContributors: number;
    maxWorkspaces: number;
  };
  features: Record<string, boolean>;
  highlighted: boolean;
  ctaText: string;
}

const ENTERPRISE_TIER = {
  id: 'enterprise',
  displayName: 'Enterprise',
  description: 'Custom solutions for large organizations',
  startingPrice: 'Starting at $250/month',
  features: [
    'Everything in Business',
    'Unlimited team members',
    'Unlimited storage',
    'Custom domain (yourcompany.cogveri.com)',
    'SCIM provisioning & SSO',
    'IP whitelist & security controls',
    'Dedicated Customer Success Manager',
    'Custom SLA with 99.9% uptime',
    'Security review & compliance support',
    'Custom integrations & workflows',
  ],
};

/**
 * Feature categories for comparison table
 */
const FEATURE_CATEGORIES = [
  {
    name: 'Recording & Playback',
    icon: Video,
    features: [
      { key: 'hdRecording', label: 'HD Recording (1080p)' },
      { key: 'removeWatermark', label: 'Remove Watermark' },
      { key: 'customThumbnails', label: 'Custom Thumbnails' },
      { key: 'downloadRecordings', label: 'Download Videos' },
    ],
  },
  {
    name: 'AI & Transcription',
    icon: Zap,
    features: [
      { key: 'basicTranscription', label: 'Auto Transcription' },
      { key: 'advancedTranscription', label: 'Speaker Detection' },
      { key: 'basicAiAnalysis', label: 'Basic AI Analysis' },
      { key: 'fullAiRubricScoring', label: 'AI Rubric Scoring' },
      { key: 'aiSummaries', label: 'AI Summaries' },
    ],
  },
  {
    name: 'Collaboration',
    icon: MessageSquare,
    features: [
      { key: 'timestampedComments', label: 'Timestamped Comments' },
      { key: 'reviewWorkflows', label: 'Review Workflows' },
      { key: 'teamWorkspaces', label: 'Team Workspaces' },
    ],
  },
  {
    name: 'Analytics',
    icon: BarChart3,
    features: [
      { key: 'basicAnalytics', label: 'View Counts' },
      { key: 'advancedAnalytics', label: 'Advanced Analytics' },
    ],
  },
  {
    name: 'Integrations',
    icon: Zap,
    features: [
      { key: 'slackIntegration', label: 'Slack Integration' },
      { key: 'webhooks', label: 'Webhooks' },
      { key: 'apiAccess', label: 'API Access' },
    ],
  },
  {
    name: 'Security & Admin',
    icon: Shield,
    features: [
      { key: 'ssoSaml', label: 'SSO/SAML' },
      { key: 'auditLogs', label: 'Audit Logs' },
      { key: 'advancedPermissions', label: 'Advanced Permissions' },
      { key: 'customDataRetention', label: 'Data Retention Policies' },
    ],
  },
];

const formatLimit = (value: number, unit: string): string => {
  if (value === -1) return 'Unlimited';
  return `${value} ${unit}`;
};

const Pricing = () => {
  const [isAnnual, setIsAnnual] = useState(true);
  const [pricingTiers, setPricingTiers] = useState<PricingTier[]>([]);
  const [trialDurationDays, setTrialDurationDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch pricing tiers and trial info from API
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

        // Fetch pricing tiers and trial info in parallel
        const [tiersResponse, trialResponse] = await Promise.all([
          fetch(`${apiUrl}/pricing/tiers`),
          fetch(`${apiUrl}/pricing/trial-info`),
        ]);

        if (!tiersResponse.ok) {
          throw new Error('Failed to fetch pricing');
        }
        const tiersData = await tiersResponse.json();
        // Filter out enterprise tier (shown separately) and sort by price
        const tiers = (tiersData.data?.tiers || [])
          .filter((t: PricingTier) => t.name !== 'enterprise')
          .sort((a: PricingTier, b: PricingTier) => a.monthlyPrice - b.monthlyPrice);
        setPricingTiers(tiers);

        // Set trial duration (use default if fetch fails)
        if (trialResponse.ok) {
          const trialData = await trialResponse.json();
          if (trialData.trial?.durationDays) {
            setTrialDurationDays(trialData.trial.durationDays);
          }
        }
      } catch (err: any) {
        console.error('Failed to fetch pricing data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Calculate content offset based on banner
  const contentPaddingTop = featureFlags.COMING_SOON_MODE ? COMING_SOON_BANNER_HEIGHT + 128 : 128;

  // Show loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <PublicNav currentPage="pricing" />
        <div className="flex items-center justify-center" style={{ paddingTop: contentPaddingTop }}>
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading pricing...</p>
          </div>
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="min-h-screen bg-white">
        <PublicNav currentPage="pricing" />
        <div className="flex items-center justify-center" style={{ paddingTop: contentPaddingTop }}>
          <div className="text-center">
            <p className="text-red-600 mb-4">Failed to load pricing information.</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Shared Navigation Component */}
      <PublicNav currentPage="pricing" />

      {/* Header */}
      <section
        className="pb-16 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-gray-50 to-white"
        style={{ paddingTop: contentPaddingTop }}
      >
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 tracking-tight">
            Video-based skills verification
          </h1>
          <p className="mt-4 text-xl text-gray-600 max-w-2xl mx-auto">
            Assign tasks, collect video submissions, and verify competency—for training, hiring, and compliance. All plans include a {trialDurationDays}-day free trial.
          </p>

          {/* Key Value Prop - Pricing Model Clarity */}
          <div className="mt-8 max-w-2xl mx-auto bg-gradient-to-r from-primary-50 to-accent-50 border border-primary-200 rounded-2xl p-6">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-primary-600 rounded-xl flex items-center justify-center">
                <Users className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 text-lg">Only pay for platform users</h3>
                <p className="text-gray-600 mt-1">
                  <strong>Platform seats</strong> are for people who create tasks and review submissions.
                  <strong className="text-primary-700"> Video submitters use magic links—unlimited and free on all plans.</strong>
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 bg-white px-3 py-1 rounded-full text-sm border border-primary-200">
                    <Check className="w-4 h-4 text-primary-600" />
                    <span className="text-gray-700">Unlimited recordings via magic link</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 bg-white px-3 py-1 rounded-full text-sm border border-primary-200">
                    <Check className="w-4 h-4 text-primary-600" />
                    <span className="text-gray-700">No account needed to submit</span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Billing Toggle */}
          <div className="mt-8 flex items-center justify-center gap-4">
            <span className={`text-sm font-medium ${!isAnnual ? 'text-gray-900' : 'text-gray-500'}`}>
              Monthly
            </span>
            <button
              onClick={() => setIsAnnual(!isAnnual)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                isAnnual ? 'bg-primary-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  isAnnual ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
            <span className={`text-sm font-medium ${isAnnual ? 'text-gray-900' : 'text-gray-500'}`}>
              Annual
              <span className="ml-1.5 inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                Save 20%
              </span>
            </span>
          </div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {pricingTiers.map((tier) => {
              const price = isAnnual ? Math.round(tier.yearlyPrice / 12) : tier.monthlyPrice;
              const isHighlighted = tier.highlighted;

              return (
                <div
                  key={tier.id}
                  className={`relative rounded-2xl p-8 ${
                    isHighlighted
                      ? 'bg-primary-600 text-white ring-4 ring-primary-600 ring-offset-2'
                      : 'bg-white border border-gray-200'
                  }`}
                >
                  {isHighlighted && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                      <span className="inline-flex items-center rounded-full bg-primary-100 px-3 py-1 text-sm font-medium text-primary-800">
                        Most Popular
                      </span>
                    </div>
                  )}

                  <div className="text-center">
                    <h3
                      className={`text-lg font-semibold ${isHighlighted ? 'text-white' : 'text-gray-900'}`}
                    >
                      {tier.displayName}
                    </h3>
                    <p
                      className={`mt-1 text-sm ${isHighlighted ? 'text-primary-100' : 'text-gray-500'}`}
                    >
                      {tier.description}
                    </p>

                    <div className="mt-6">
                      <span
                        className={`text-4xl font-bold ${isHighlighted ? 'text-white' : 'text-gray-900'}`}
                      >
                        ${price}
                      </span>
                      {tier.monthlyPrice > 0 && (
                        <span
                          className={`text-sm ${isHighlighted ? 'text-primary-100' : 'text-gray-500'}`}
                        >
                          /month
                        </span>
                      )}
                    </div>

                    {isAnnual && tier.monthlyPrice > 0 && (
                      <p
                        className={`mt-1 text-sm ${isHighlighted ? 'text-primary-100' : 'text-gray-500'}`}
                      >
                        Billed annually (${tier.yearlyPrice}/yr)
                      </p>
                    )}
                  </div>

                  <Link
                    to="/register"
                    className={`mt-8 block w-full py-3 px-4 rounded-lg text-center font-medium transition ${
                      isHighlighted
                        ? 'bg-white text-primary-600 hover:bg-primary-50'
                        : 'bg-primary-600 text-white hover:bg-primary-700'
                    }`}
                  >
                    {tier.ctaText}
                  </Link>

                  {/* Limits */}
                  <ul className="mt-8 space-y-3">
                    <li className="flex items-start gap-2">
                      <Users
                        className={`w-5 h-5 flex-shrink-0 ${
                          isHighlighted ? 'text-primary-200' : 'text-gray-400'
                        }`}
                      />
                      <span className={`text-sm ${isHighlighted ? 'text-primary-100' : 'text-gray-600'}`}>
                        {formatLimit(tier.limits.maxMembers, 'platform seat' + (tier.limits.maxMembers !== 1 ? 's' : ''))}
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Video
                        className={`w-5 h-5 flex-shrink-0 ${
                          isHighlighted ? 'text-primary-200' : 'text-gray-400'
                        }`}
                      />
                      <span className={`text-sm ${isHighlighted ? 'text-primary-100' : 'text-gray-600'}`}>
                        {formatLimit(tier.limits.maxVideosPerMonth, 'videos/month')}
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Shield
                        className={`w-5 h-5 flex-shrink-0 ${
                          isHighlighted ? 'text-primary-200' : 'text-gray-400'
                        }`}
                      />
                      <span className={`text-sm ${isHighlighted ? 'text-primary-100' : 'text-gray-600'}`}>
                        {formatLimit(tier.limits.maxStorageGb, 'GB storage')}
                      </span>
                    </li>
                  </ul>

                  {/* Key Features */}
                  <div
                    className={`mt-6 pt-6 border-t ${
                      isHighlighted ? 'border-primary-500' : 'border-gray-100'
                    }`}
                  >
                    <ul className="space-y-2">
                      {tier.features.hdRecording && (
                        <li className="flex items-center gap-2">
                          <Check
                            className={`w-4 h-4 ${isHighlighted ? 'text-primary-200' : 'text-green-500'}`}
                          />
                          <span className={`text-sm ${isHighlighted ? 'text-white' : 'text-gray-700'}`}>
                            HD Recording
                          </span>
                        </li>
                      )}
                      {tier.features.basicTranscription && (
                        <li className="flex items-center gap-2">
                          <Check
                            className={`w-4 h-4 ${isHighlighted ? 'text-primary-200' : 'text-green-500'}`}
                          />
                          <span className={`text-sm ${isHighlighted ? 'text-white' : 'text-gray-700'}`}>
                            Transcription
                          </span>
                        </li>
                      )}
                      {tier.features.fullAiRubricScoring && (
                        <li className="flex items-center gap-2">
                          <Check
                            className={`w-4 h-4 ${isHighlighted ? 'text-primary-200' : 'text-green-500'}`}
                          />
                          <span className={`text-sm ${isHighlighted ? 'text-white' : 'text-gray-700'}`}>
                            AI Rubric Scoring
                          </span>
                        </li>
                      )}
                      {tier.features.timestampedComments && (
                        <li className="flex items-center gap-2">
                          <Check
                            className={`w-4 h-4 ${isHighlighted ? 'text-primary-200' : 'text-green-500'}`}
                          />
                          <span className={`text-sm ${isHighlighted ? 'text-white' : 'text-gray-700'}`}>
                            Timestamped Comments
                          </span>
                        </li>
                      )}
                      {tier.features.teamWorkspaces && (
                        <li className="flex items-center gap-2">
                          <Check
                            className={`w-4 h-4 ${isHighlighted ? 'text-primary-200' : 'text-green-500'}`}
                          />
                          <span className={`text-sm ${isHighlighted ? 'text-white' : 'text-gray-700'}`}>
                            Team Workspaces
                          </span>
                        </li>
                      )}
                      {tier.features.ssoSaml && (
                        <li className="flex items-center gap-2">
                          <Check
                            className={`w-4 h-4 ${isHighlighted ? 'text-primary-200' : 'text-green-500'}`}
                          />
                          <span className={`text-sm ${isHighlighted ? 'text-white' : 'text-gray-700'}`}>
                            SSO/SAML
                          </span>
                        </li>
                      )}
                      {tier.features.apiAccess && (
                        <li className="flex items-center gap-2">
                          <Check
                            className={`w-4 h-4 ${isHighlighted ? 'text-primary-200' : 'text-green-500'}`}
                          />
                          <span className={`text-sm ${isHighlighted ? 'text-white' : 'text-gray-700'}`}>
                            API Access
                          </span>
                        </li>
                      )}
                    </ul>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Enterprise Card */}
          <div className="mt-12 bg-gray-900 rounded-2xl p-8 lg:p-12">
            <div className="lg:flex lg:items-center lg:justify-between">
              <div>
                <h3 className="text-2xl font-bold text-white">{ENTERPRISE_TIER.displayName}</h3>
                <p className="mt-2 text-gray-400">{ENTERPRISE_TIER.description}</p>
                <ul className="mt-6 grid grid-cols-2 gap-x-8 gap-y-2">
                  {ENTERPRISE_TIER.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-400" />
                      <span className="text-sm text-gray-300">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-8 lg:mt-0 lg:ml-12">
                <a
                  href="mailto:sales@cogveri.com"
                  className="inline-flex items-center px-8 py-4 bg-white text-gray-900 rounded-xl font-semibold hover:bg-gray-100 transition"
                >
                  Contact Sales
                  <ArrowRight className="ml-2 w-5 h-5" />
                </a>
                <p className="mt-3 text-sm text-gray-400 text-center lg:text-left">
                  {ENTERPRISE_TIER.startingPrice} • Custom pricing for teams of 25+
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Comparison Table */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900">Compare plans</h2>
            <p className="mt-4 text-lg text-gray-600">
              See all features and find the right plan for your team
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="py-4 px-4 text-left text-sm font-medium text-gray-500 w-1/3">
                    Features
                  </th>
                  {pricingTiers.map((tier) => (
                    <th
                      key={tier.id}
                      className={`py-4 px-4 text-center text-sm font-semibold ${
                        tier.highlighted ? 'text-primary-600' : 'text-gray-900'
                      }`}
                    >
                      {tier.displayName}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FEATURE_CATEGORIES.map((category) => (
                  <>
                    <tr key={category.name} className="bg-gray-100">
                      <td colSpan={5} className="py-3 px-4">
                        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                          <category.icon className="w-4 h-4" />
                          {category.name}
                        </div>
                      </td>
                    </tr>
                    {category.features.map((feature) => (
                      <tr key={feature.key} className="border-b border-gray-100">
                        <td className="py-3 px-4 text-sm text-gray-600">{feature.label}</td>
                        {pricingTiers.map((tier) => (
                          <td key={`${tier.id}-${feature.key}`} className="py-3 px-4 text-center">
                            {tier.features[feature.key] ? (
                              <Check className="w-5 h-5 text-green-500 mx-auto" />
                            ) : (
                              <X className="w-5 h-5 text-gray-300 mx-auto" />
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900">Frequently asked questions</h2>
          </div>

          <div className="space-y-6">
            {[
              {
                q: 'Can I change plans at any time?',
                a: 'Yes! You can upgrade or downgrade your plan at any time. When upgrading, you\'ll be charged the prorated difference. When downgrading, the remaining credit will be applied to your next billing cycle.',
              },
              {
                q: 'What happens when I reach my limits?',
                a: 'We\'ll notify you when you\'re approaching your limits. You can upgrade your plan at any time to get more capacity. We won\'t cut off your access unexpectedly.',
              },
              {
                q: 'How do external contributors work?',
                a: 'External contributors are people outside your organization who can access specific tasks via magic links. They don\'t need an account, and they don\'t count toward your team member limit.',
              },
              {
                q: 'Is there a free trial?',
                a: `Yes! All paid plans include a ${trialDurationDays}-day free trial. No credit card required to start. You'll only be charged after the trial ends if you decide to continue.`,
              },
              {
                q: 'What payment methods do you accept?',
                a: 'We accept all major credit cards (Visa, Mastercard, American Express) and can arrange invoicing for annual Enterprise plans.',
              },
            ].map((faq, i) => (
              <div key={i} className="bg-gray-50 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 flex items-start gap-2">
                  <HelpCircle className="w-5 h-5 text-primary-600 flex-shrink-0 mt-0.5" />
                  {faq.q}
                </h3>
                <p className="mt-2 text-gray-600 ml-7">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-primary-600">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-white">Know what your people actually know</h2>
          <p className="mt-4 text-lg text-primary-100">
            Start your {trialDurationDays}-day free trial. No credit card required. Send your first assessment task in minutes.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/register"
              className="w-full sm:w-auto bg-white text-primary-600 px-8 py-4 rounded-xl text-lg font-semibold hover:bg-primary-50 transition shadow-lg"
            >
              Start Free Trial
            </Link>
            <a
              href="mailto:sales@cogveri.com"
              className="w-full sm:w-auto border-2 border-white text-white px-8 py-4 rounded-xl text-lg font-semibold hover:bg-white/10 transition"
            >
              Talk to Sales
            </a>
          </div>
        </div>
      </section>

      {/* Footer - Light theme for logo visibility */}
      <footer className="py-12 px-4 sm:px-6 lg:px-8 bg-gray-50 border-t border-gray-200">
        <div className="max-w-7xl mx-auto text-center">
          <div className="flex items-center justify-center mb-4">
            <img src="/cogveri-logo-horizontal.png" alt="CogVeri" className="h-10 w-auto" />
          </div>
          <p className="text-gray-500 text-sm">
            &copy; {new Date().getFullYear()} CogVeri. All rights reserved.
          </p>
          <div className="mt-4 flex items-center justify-center gap-6">
            <Link to="/privacy" className="text-gray-500 hover:text-primary-600 text-sm transition">
              Privacy Policy
            </Link>
            <Link to="/terms" className="text-gray-500 hover:text-primary-600 text-sm transition">
              Terms of Service
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Pricing;
