import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CreditCard,
  TrendingUp,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  Calendar,
  DollarSign,
  Users,
  HardDrive,
  Video,
  ClipboardList,
  UserPlus,
  Building2,
  Globe,
  LayoutTemplate,
} from 'lucide-react';
import { useOrganization } from '../../contexts/OrganizationContext';
import { useAuth } from '../../contexts/AuthContext';
import DomainManagement from '../../components/settings/DomainManagement';
import MemberManagement from '../../components/settings/MemberManagement';
import TemplateManagement from '../../components/settings/TemplateManagement';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import DomainClaimingPrompt from '../../components/settings/DomainClaimingPrompt';
import {
  UsageBar,
  ChangePlanModal,
  BillingContactCard,
  PlanCard,
  TrialBanner,
  TrialExpiredBanner,
} from '../../components/billing';
import {
  useSubscription,
  useUsage,
  usePricingTiers,
  useOpenBillingPortal,
  useCancelSubscription,
  useReactivateSubscription,
  useUpdateSubscription,
  useCreateCheckout,
  useSyncSubscription,
  getTrialDaysRemaining,
  formatBillingDate,
  formatCurrency,
} from '../../hooks/useBilling';
import { PricingTier } from '../../services/billing.api';

type SettingsTab = 'overview' | 'billing' | 'domain' | 'members' | 'templates';

// Multi-member tiers that qualify for domain claiming
const MULTI_MEMBER_TIERS = ['enterprise'];

interface DomainClaimingData {
  suggestedDomain: string | null;
  organizationName: string;
  organizationId: string;
}

const OrganizationSettings = () => {
  const { currentOrganization } = useOrganization();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<SettingsTab>(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && ['overview', 'billing', 'domain', 'members', 'templates'].includes(tabParam)) {
      return tabParam as SettingsTab;
    }
    return 'overview';
  });
  const [isEditingName, setIsEditingName] = useState(false);
  const [organizationName, setOrganizationName] = useState(currentOrganization?.name || '');

  // Sync tab with URL parameter
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && ['overview', 'billing', 'domain', 'members', 'templates'].includes(tabParam)) {
      setActiveTab(tabParam as SettingsTab);
    }
  }, [searchParams]);

  // Update URL when tab changes
  const handleTabChange = (tab: SettingsTab) => {
    setActiveTab(tab);
    if (tab === 'overview') {
      searchParams.delete('tab');
    } else {
      searchParams.set('tab', tab);
    }
    setSearchParams(searchParams, { replace: true });
  };

  // Billing state
  const [showChangePlanModal, setShowChangePlanModal] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isAnnual, setIsAnnual] = useState(true);
  const [selectedTierForConfirm, setSelectedTierForConfirm] = useState<PricingTier | null>(null);
  const [showDomainClaimModal, setShowDomainClaimModal] = useState(false);
  const [domainClaimData, setDomainClaimData] = useState<DomainClaimingData | null>(null);
  const planSectionRef = useRef<HTMLDivElement>(null);

  // Billing queries
  const { data: subscription, isLoading: subLoading, error: subError } = useSubscription();
  const { data: usage, isLoading: usageLoading } = useUsage();
  const { data: tiers } = usePricingTiers();

  // Billing mutations
  const openPortal = useOpenBillingPortal();
  const cancelSubscription = useCancelSubscription();
  const reactivateSubscription = useReactivateSubscription();
  const updateSubscription = useUpdateSubscription();
  const createCheckout = useCreateCheckout();
  const syncSubscription = useSyncSubscription();

  const trialDaysRemaining = getTrialDaysRemaining(subscription);

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <Building2 className="w-4 h-4" /> },
    // Billing tab hidden - plans managed by admin
    // { id: 'billing', label: 'Billing', icon: <CreditCard className="w-4 h-4" /> },
    { id: 'domain', label: 'Domain', icon: <Globe className="w-4 h-4" /> },
    { id: 'members', label: 'Members', icon: <Users className="w-4 h-4" /> },
    { id: 'templates', label: 'Templates', icon: <LayoutTemplate className="w-4 h-4" /> },
    // Security tab hidden until features are implemented - see memory: Security_Features_Roadmap
  ];

  // Get user role
  const userRole = user?.org_role || 'limited';

  // Billing handlers
  const handleCancelSubscription = async () => {
    await cancelSubscription.mutateAsync(false);
    setShowCancelConfirm(false);
  };

  const handlePlanSelect = (tier: PricingTier) => {
    if (tier.name === subscription?.tier) return;
    if (tier.name === 'enterprise') {
      window.location.href = '/enterprise';
      return;
    }
    setSelectedTierForConfirm(tier);
    setShowChangePlanModal(true);
  };

  const handleConfirmPlanChange = async (tier: PricingTier) => {
    const hasActiveSubscription =
      subscription?.status === 'active' || subscription?.status === 'trialing';
    const currentTierName = subscription?.tier || 'free';
    const isUpgradeToMultiMember =
      !MULTI_MEMBER_TIERS.includes(currentTierName) && MULTI_MEMBER_TIERS.includes(tier.name);

    if (hasActiveSubscription) {
      await updateSubscription.mutateAsync({ tierName: tier.name, isAnnual });
      setShowChangePlanModal(false);
      setSelectedTierForConfirm(null);

      if (isUpgradeToMultiMember && currentOrganization?.id) {
        try {
          const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
          const tokenKey = import.meta.env.VITE_AUTH_TOKEN_KEY || 'cogveri_auth_token';
          const token = localStorage.getItem(tokenKey);

          const response = await fetch(
            `${apiUrl}/domain-verification/claiming-status/${currentOrganization.id}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );

          if (response.ok) {
            const data = await response.json();
            if (data.data.canClaimDomain && data.data.suggestedDomain) {
              setDomainClaimData({
                suggestedDomain: data.data.suggestedDomain,
                organizationName: currentOrganization.name || 'your organization',
                organizationId: currentOrganization.id,
              });
              setShowDomainClaimModal(true);
            }
          }
        } catch (error) {
          console.error('Failed to check domain claiming status:', error);
        }
      }
    } else {
      await createCheckout.mutateAsync({ tierName: tier.name, isAnnual });
    }
  };

  const scrollToPlanSection = () => {
    planSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const getUsageIcon = (feature: string) => {
    switch (feature) {
      case 'members':
        return <Users className="w-5 h-5 text-primary-500" />;
      case 'storage':
        return <HardDrive className="w-5 h-5 text-primary-500" />;
      case 'videos':
        return <Video className="w-5 h-5 text-primary-500" />;
      case 'tasks':
        return <ClipboardList className="w-5 h-5 text-primary-500" />;
      case 'external_contributors':
        return <UserPlus className="w-5 h-5 text-primary-500" />;
      default:
        return <TrendingUp className="w-5 h-5 text-primary-500" />;
    }
  };

  if (!currentOrganization) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-gray-500">No organization selected</p>
      </div>
    );
  }

  const tier = subscription?.tier || 'free';
  const tierDisplayName = subscription?.tierDisplayName || 'Free';

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600 mt-1">Manage your organization, billing, and preferences</p>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 overflow-x-auto">
        <div className="flex space-x-6 min-w-max">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`flex items-center gap-2 px-1 py-4 border-b-2 font-medium text-sm transition whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="space-y-6">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <Card className="p-6">
              <div className="space-y-6">
                {/* Organization Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">
                    Organization Name
                  </label>
                  {isEditingName ? (
                    <div className="flex space-x-3">
                      <input
                        type="text"
                        value={organizationName}
                        onChange={(e) => setOrganizationName(e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        placeholder="Organization name"
                      />
                      <Button variant="primary" onClick={() => setIsEditingName(false)}>
                        Save
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setIsEditingName(false);
                          setOrganizationName(currentOrganization.name);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <span className="text-gray-900">{currentOrganization.name}</span>
                      {userRole === 'owner' || userRole === 'admin' ? (
                        <Button variant="ghost" onClick={() => setIsEditingName(true)}>
                          Edit
                        </Button>
                      ) : null}
                    </div>
                  )}
                </div>

                {/* Current Plan - Quick Access */}
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">
                    Current Plan
                  </label>
                  <div className="p-4 bg-gradient-to-r from-primary-50 to-primary-100/50 border border-primary-200 rounded-xl">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xl font-bold text-primary-900">
                          {tierDisplayName}
                        </span>
                        {subscription?.status === 'trialing' && trialDaysRemaining !== null && (
                          <span className="ml-3 text-sm text-primary-600">
                            {trialDaysRemaining} days left in trial
                          </span>
                        )}
                      </div>
                      {/* Billing management hidden - plans managed by admin */}
                    </div>
                  </div>
                </div>

                {/* Created Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">Created</label>
                  <p className="text-gray-600">
                    {new Date(currentOrganization.created_at).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </p>
                </div>
              </div>
            </Card>

            {/* Note: Organization deletion is available only to System Admins via the Admin Dashboard */}
          </div>
        )}

        {/* Billing Tab */}
        {activeTab === 'billing' && (
          <div className="space-y-6">
            {/* Trial Banner */}
            {subscription?.status === 'trialing' &&
              trialDaysRemaining !== null &&
              trialDaysRemaining > 0 && (
                <TrialBanner
                  variant="full"
                  onUpgradeClick={scrollToPlanSection}
                  className="rounded-xl overflow-hidden"
                />
              )}

            {/* Trial Expired Banner (read-only mode) */}
            <TrialExpiredBanner
              variant="full"
              onUpgradeClick={scrollToPlanSection}
              className="rounded-xl overflow-hidden"
            />

            {subLoading ? (
              <LoadingSpinner fullScreen message="Loading billing information..." />
            ) : subError ? (
              <div className="flex flex-col items-center justify-center h-96 text-center">
                <AlertTriangle className="w-12 h-12 text-error mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Failed to load billing</h3>
                <p className="text-gray-600 mb-4">
                  There was an error loading your billing information.
                </p>
                <Button variant="primary" onClick={() => window.location.reload()}>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Retry
                </Button>
              </div>
            ) : (
              <>
                {/* Current Plan + Usage Overview Row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Current Plan */}
                  <Card className="p-8 bg-white shadow-lg hover:shadow-xl transition-shadow duration-300 border-0">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">Current Plan</h3>
                          <p className="text-sm text-gray-500">Your subscription details</p>
                        </div>
                        <button
                          onClick={() => syncSubscription.mutate()}
                          disabled={syncSubscription.isPending}
                          className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors disabled:opacity-50"
                          title="Sync with Stripe"
                        >
                          <RefreshCw
                            className={`w-4 h-4 ${syncSubscription.isPending ? 'animate-spin' : ''}`}
                          />
                        </button>
                      </div>
                      <span
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wide ${
                          subscription?.status === 'active'
                            ? 'bg-gradient-to-r from-success-50 to-success-100 text-success-700 ring-1 ring-success-200'
                            : subscription?.status === 'trialing'
                              ? 'bg-gradient-to-r from-primary-50 to-primary-100 text-primary-700 ring-1 ring-primary-200'
                              : subscription?.status === 'canceled'
                                ? 'bg-gradient-to-r from-gray-50 to-gray-100 text-gray-600 ring-1 ring-gray-200'
                                : tier === 'free'
                                  ? 'bg-gradient-to-r from-gray-50 to-gray-100 text-gray-600 ring-1 ring-gray-200'
                                  : 'bg-gradient-to-r from-warning-50 to-warning-100 text-warning-700 ring-1 ring-warning-200'
                        }`}
                      >
                        {subscription?.status === 'trialing'
                          ? 'Trial'
                          : subscription?.status === 'active'
                            ? 'Active'
                            : tier === 'free'
                              ? 'Free Plan'
                              : subscription?.status || 'Free Plan'}
                      </span>
                    </div>

                    <div className="flex items-baseline gap-3 mb-8">
                      <span className="text-4xl font-extrabold text-gray-900 tracking-tight">
                        {tierDisplayName}
                      </span>
                    </div>

                    {subscription && (
                      <div className="space-y-4 mb-8">
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                          <div className="flex items-center gap-3 text-gray-600">
                            <div className="w-8 h-8 rounded-lg bg-white shadow-sm flex items-center justify-center">
                              <Calendar className="w-4 h-4 text-primary-500" />
                            </div>
                            <span className="font-medium text-sm">Current period</span>
                          </div>
                          <span className="text-sm font-semibold text-gray-900">
                            {formatBillingDate(subscription.currentPeriodStart)} -{' '}
                            {formatBillingDate(subscription.currentPeriodEnd)}
                          </span>
                        </div>

                        {subscription.nextInvoiceAmount !== null && (
                          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                            <div className="flex items-center gap-3 text-gray-600">
                              <div className="w-8 h-8 rounded-lg bg-white shadow-sm flex items-center justify-center">
                                <DollarSign className="w-4 h-4 text-primary-500" />
                              </div>
                              <span className="font-medium text-sm">Next payment</span>
                            </div>
                            <span className="text-sm font-bold text-gray-900">
                              {formatCurrency(
                                subscription.nextInvoiceAmount,
                                subscription.currency
                              )}
                            </span>
                          </div>
                        )}

                        {subscription.cancelAtPeriodEnd && (
                          <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-warning-50 to-warning-100/50 rounded-xl border border-warning-200">
                            <div className="w-8 h-8 rounded-lg bg-warning-100 flex items-center justify-center flex-shrink-0">
                              <AlertTriangle className="w-4 h-4 text-warning-600" />
                            </div>
                            <span className="text-sm font-medium text-warning-800">
                              Subscription will be canceled on{' '}
                              {formatBillingDate(subscription.currentPeriodEnd)}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex gap-3">
                      {subscription?.cancelAtPeriodEnd ? (
                        <Button
                          variant="primary"
                          onClick={() => reactivateSubscription.mutate()}
                          isLoading={reactivateSubscription.isPending}
                          className="flex-1"
                        >
                          Reactivate Subscription
                        </Button>
                      ) : (
                        tier !== 'free' && (
                          <Button
                            variant="ghost"
                            onClick={() => setShowCancelConfirm(true)}
                            className="text-gray-500 hover:text-error"
                          >
                            Cancel Subscription
                          </Button>
                        )
                      )}
                    </div>
                  </Card>

                  {/* Usage Overview */}
                  <Card className="p-8 bg-gradient-to-br from-gray-50 to-white shadow-lg border-0 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-primary-100/30 to-transparent rounded-bl-full" />
                    <div className="relative">
                      <div className="mb-6">
                        <h3 className="text-lg font-semibold text-gray-900">Usage Overview</h3>
                        <p className="text-sm text-gray-500">Current billing period</p>
                      </div>

                      {usageLoading ? (
                        <LoadingSpinner size="sm" />
                      ) : usage ? (
                        <div className="space-y-5">
                          {usage.metrics.map((metric) => (
                            <div key={metric.feature} className="group">
                              <div className="flex items-center gap-4">
                                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center group-hover:shadow-md transition-shadow">
                                  {getUsageIcon(metric.feature)}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <UsageBar
                                    label={metric.label}
                                    current={metric.current}
                                    max={metric.limit}
                                    unit={metric.unit}
                                    warningThreshold={usage.warningThreshold}
                                    showIcon={false}
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-gray-500">Unable to load usage data</p>
                      )}
                    </div>
                  </Card>
                </div>

                {/* Plan Selection Section */}
                <div ref={planSectionRef} className="pt-6">
                  <div className="relative bg-gradient-to-br from-gray-50 via-white to-primary-50/30 rounded-2xl p-8 md:p-10 shadow-lg border border-gray-100">
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-1 bg-gradient-to-r from-transparent via-primary-400 to-transparent rounded-full" />

                    <div className="text-center mb-10">
                      <h3 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">
                        Choose Your Plan
                      </h3>
                      <p className="text-gray-600 max-w-xl mx-auto">
                        Scale your workflow with the plan that fits your needs. Upgrade or downgrade
                        anytime.
                      </p>
                    </div>

                    {/* Billing Toggle */}
                    <div className="flex items-center justify-center gap-4 mb-10">
                      <span
                        className={`text-sm font-medium transition-colors ${
                          !isAnnual ? 'text-gray-900' : 'text-gray-400'
                        }`}
                      >
                        Monthly
                      </span>
                      <button
                        onClick={() => setIsAnnual(!isAnnual)}
                        className={`relative inline-flex h-7 w-14 items-center rounded-full transition-all duration-300 shadow-inner ${
                          isAnnual
                            ? 'bg-gradient-to-r from-primary-500 to-primary-600'
                            : 'bg-gray-300'
                        }`}
                      >
                        <span
                          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-all duration-300 ${
                            isAnnual ? 'translate-x-8' : 'translate-x-1'
                          }`}
                        />
                      </button>
                      <span
                        className={`text-sm font-medium transition-colors ${
                          isAnnual ? 'text-gray-900' : 'text-gray-400'
                        }`}
                      >
                        Annual
                        <span className="ml-2 inline-flex items-center rounded-full bg-gradient-to-r from-success-500 to-success-600 px-2.5 py-1 text-xs font-bold text-white shadow-sm">
                          Save 20%
                        </span>
                      </span>
                    </div>

                    {/* Plan Cards Grid */}
                    {tiers ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                        {tiers.map((planTier) => (
                          <PlanCard
                            key={planTier.id}
                            tier={planTier}
                            isCurrent={planTier.name === tier}
                            isAnnual={isAnnual}
                            onSelect={handlePlanSelect}
                          />
                        ))}
                      </div>
                    ) : (
                      <LoadingSpinner size="md" />
                    )}

                    <p className="text-center text-sm text-gray-500 mt-10">
                      Need custom features or higher limits?{' '}
                      <a
                        href="/enterprise"
                        className="text-primary-600 hover:text-primary-700 font-semibold underline underline-offset-2"
                      >
                        Contact us for enterprise pricing
                      </a>
                    </p>
                  </div>
                </div>

                {/* Billing Contact & Stripe Portal */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <BillingContactCard />

                  <Card className="p-8">
                    <div className="text-center">
                      <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                        <CreditCard className="w-8 h-8 text-gray-500" />
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">
                        Manage Billing in Stripe
                      </h3>
                      <p className="text-gray-600 mb-6 max-w-md mx-auto">
                        View invoices, update payment methods, and manage billing details securely
                        through Stripe.
                      </p>
                      <Button
                        variant="primary"
                        onClick={() => openPortal.mutate()}
                        isLoading={openPortal.isPending}
                        size="lg"
                      >
                        <ExternalLink className="w-4 h-4 mr-2" />
                        Open Billing Portal
                      </Button>
                    </div>
                  </Card>
                </div>
              </>
            )}
          </div>
        )}

        {/* Domain Tab */}
        {activeTab === 'domain' && (
          <DomainManagement
            organizationId={currentOrganization.id}
            currentDomain={currentOrganization.domain}
          />
        )}

        {/* Members Tab */}
        {activeTab === 'members' && (
          <MemberManagement
            organizationId={currentOrganization.id}
            organizationName={currentOrganization.name}
            organizationOwnerId={currentOrganization.ownerId}
            userRole={userRole}
            userEmail={user?.email}
            userId={user?.id}
          />
        )}

        {/* Templates Tab */}
        {activeTab === 'templates' && (
          <TemplateManagement organizationId={currentOrganization.id} userRole={userRole} />
        )}

        {/* Security Tab - Hidden until features are implemented
            See memory: Security_Features_Roadmap for planned features:
            - API Keys Management
            - Two-Factor Authentication (2FA)
            - Session Management
            - Audit Logs
        */}
      </div>

      {/* Cancel Confirmation Dialog */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowCancelConfirm(false)} />
          <div className="relative bg-white rounded-xl p-6 max-w-md mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Cancel Subscription?</h3>
            <p className="text-gray-600 mb-4">
              Your subscription will remain active until{' '}
              <strong>{formatBillingDate(subscription?.currentPeriodEnd || '')}</strong>. After
              that, you will lose access to premium features.
            </p>
            <div className="flex gap-3">
              <Button
                variant="secondary"
                onClick={() => setShowCancelConfirm(false)}
                className="flex-1"
              >
                Keep Subscription
              </Button>
              <Button
                variant="danger"
                onClick={handleCancelSubscription}
                isLoading={cancelSubscription.isPending}
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Change Plan Modal */}
      {tiers && selectedTierForConfirm && (
        <ChangePlanModal
          isOpen={showChangePlanModal}
          onClose={() => {
            setShowChangePlanModal(false);
            setSelectedTierForConfirm(null);
          }}
          currentTier={tier}
          tiers={tiers}
          isAnnual={isAnnual}
          onToggleBilling={() => setIsAnnual(!isAnnual)}
          onSelectTier={() => {}}
          onConfirmChange={handleConfirmPlanChange}
          isChanging={updateSubscription.isPending || createCheckout.isPending}
        />
      )}

      {/* Domain Claiming Prompt */}
      {domainClaimData && (
        <DomainClaimingPrompt
          isOpen={showDomainClaimModal}
          onClose={() => {
            setShowDomainClaimModal(false);
            setDomainClaimData(null);
          }}
          organizationId={domainClaimData.organizationId}
          suggestedDomain={domainClaimData.suggestedDomain}
          organizationName={domainClaimData.organizationName}
        />
      )}
    </div>
  );
};

export default OrganizationSettings;
