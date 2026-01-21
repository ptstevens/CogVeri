import { useState } from 'react';
import { ArrowRight, Check, AlertTriangle } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import PlanCard from './PlanCard';
import { PricingTier } from '../../services/billing.api';
import { formatCurrency } from '../../hooks/useBilling';

export interface ChangePlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTier: string;
  tiers: PricingTier[];
  isAnnual: boolean;
  onToggleBilling: () => void;
  onSelectTier: (tier: PricingTier) => void;
  onConfirmChange: (tier: PricingTier) => void;
  isChanging?: boolean;
}

// Backwards compatibility alias
export type UpgradeModalProps = ChangePlanModalProps;

const ChangePlanModal = ({
  isOpen,
  onClose,
  currentTier,
  tiers,
  isAnnual,
  onToggleBilling,
  onSelectTier,
  onConfirmChange,
  isChanging = false,
}: ChangePlanModalProps) => {
  const [selectedTier, setSelectedTier] = useState<PricingTier | null>(null);
  const [step, setStep] = useState<'select' | 'confirm'>('select');

  const handleSelectTier = (tier: PricingTier) => {
    if (tier.name === 'enterprise') {
      // Navigate to enterprise page
      window.location.href = '/enterprise';
      return;
    }
    setSelectedTier(tier);
    onSelectTier(tier);
    setStep('confirm');
  };

  const handleConfirm = () => {
    if (selectedTier) {
      onConfirmChange(selectedTier);
    }
  };

  const handleBack = () => {
    setStep('select');
    setSelectedTier(null);
  };

  const handleClose = () => {
    setStep('select');
    setSelectedTier(null);
    onClose();
  };

  const currentTierData = tiers.find((t) => t.name === currentTier);
  const isDowngrade = selectedTier && currentTierData
    ? selectedTier.monthlyPrice < currentTierData.monthlyPrice
    : false;

  const getChangeSummary = () => {
    if (!selectedTier || !currentTierData) return null;

    const improvements: string[] = [];
    const reductions: string[] = [];

    // Compare limits
    const limitLabels: Record<string, string> = {
      maxMembers: 'team members',
      maxStorageGb: 'GB storage',
      maxTasksPerMonth: 'tasks/month',
      maxVideosPerMonth: 'videos/month',
      maxExternalContributors: 'external contributors',
      maxWorkspaces: 'workspaces',
    };

    for (const [key, label] of Object.entries(limitLabels)) {
      const currentLimit = currentTierData.limits[key as keyof typeof currentTierData.limits];
      const newLimit = selectedTier.limits[key as keyof typeof selectedTier.limits];

      if (newLimit > currentLimit || (newLimit === -1 && currentLimit !== -1)) {
        const newValue = newLimit === -1 ? 'Unlimited' : newLimit;
        improvements.push(`${newValue} ${label}`);
      } else if (newLimit < currentLimit && newLimit !== -1) {
        reductions.push(`${newLimit} ${label}`);
      }
    }

    // Compare features
    const featureLabels: Record<string, string> = {
      hdRecording: 'HD Recording',
      aiSummaries: 'AI Summaries',
      ssoSaml: 'SSO/SAML',
      apiAccess: 'API Access',
      customBranding: 'Custom Branding',
      auditLogs: 'Audit Logs',
      prioritySupport: 'Priority Support',
    };

    for (const [key, label] of Object.entries(featureLabels)) {
      const hadFeature = currentTierData.features[key];
      const hasFeature = selectedTier.features[key];

      if (hasFeature && !hadFeature) {
        improvements.push(label);
      } else if (!hasFeature && hadFeature) {
        reductions.push(`No ${label}`);
      }
    }

    return { improvements, reductions };
  };

  const changeSummary = getChangeSummary();

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={step === 'select' ? 'Change Plan' : 'Confirm Plan Change'}
      size={step === 'select' ? 'xl' : 'lg'}
    >
      {step === 'select' && (
        <div className="space-y-6">
          {/* Billing Toggle */}
          <div className="flex items-center justify-center gap-4 p-4 bg-gray-50 rounded-xl">
            <span className={`text-sm font-medium ${!isAnnual ? 'text-gray-900' : 'text-gray-500'}`}>
              Monthly
            </span>
            <button
              onClick={onToggleBilling}
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
              <span className="ml-1.5 inline-flex items-center rounded-full bg-success-50 px-2 py-0.5 text-xs font-medium text-success-700">
                Save 20%
              </span>
            </span>
          </div>

          {/* Plan Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {tiers.map((tier) => (
              <PlanCard
                key={tier.id}
                tier={tier}
                isCurrent={tier.name === currentTier}
                isAnnual={isAnnual}
                onSelect={handleSelectTier}
                compact
              />
            ))}
          </div>

          <p className="text-center text-sm text-gray-500">
            Need more? <a href="/enterprise" className="text-primary-600 hover:text-primary-700 font-medium">Contact us</a> for enterprise pricing.
          </p>
        </div>
      )}

      {step === 'confirm' && selectedTier && (
        <div className="space-y-6">
          {/* Summary Card */}
          <div className="p-4 bg-gray-50 rounded-xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm text-gray-500">Changing from</p>
                <p className="font-semibold text-gray-900">{currentTierData?.displayName}</p>
              </div>
              <ArrowRight className="w-5 h-5 text-gray-400" />
              <div className="text-right">
                <p className="text-sm text-gray-500">Changing to</p>
                <p className="font-semibold text-primary-600">{selectedTier.displayName}</p>
              </div>
            </div>

            <div className="pt-4 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">New price</span>
                <span className="text-xl font-bold text-gray-900">
                  {formatCurrency(
                    isAnnual
                      ? Math.round(selectedTier.yearlyPrice / 12) * 100
                      : selectedTier.monthlyPrice * 100
                  )}
                  <span className="text-sm font-normal text-gray-500">/month</span>
                </span>
              </div>
              {isAnnual && (
                <p className="text-right text-sm text-gray-500 mt-1">
                  Billed annually ({formatCurrency(selectedTier.yearlyPrice * 100)}/year)
                </p>
              )}
            </div>
          </div>

          {/* Changes */}
          {changeSummary && (
            <div className="space-y-4">
              {changeSummary.improvements.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-900 mb-2">
                    {isDowngrade ? 'You will keep' : 'You will gain'}
                  </h4>
                  <ul className="space-y-1">
                    {changeSummary.improvements.map((item, idx) => (
                      <li key={idx} className="flex items-center gap-2 text-sm text-gray-600">
                        <Check className="w-4 h-4 text-success flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {changeSummary.reductions.length > 0 && (
                <div className="p-3 bg-warning-50 rounded-lg">
                  <h4 className="text-sm font-medium text-warning-800 mb-2 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    You will lose access to
                  </h4>
                  <ul className="space-y-1">
                    {changeSummary.reductions.map((item, idx) => (
                      <li key={idx} className="text-sm text-warning-700">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Warning for downgrade */}
          {isDowngrade && (
            <div className="p-4 bg-warning-50 border border-warning-200 rounded-lg">
              <p className="text-sm text-warning-800">
                <strong>Note:</strong> Changes will take effect at the end of your current billing period.
                You will continue to have access to your current plan features until then.
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-gray-200">
            <Button variant="secondary" onClick={handleBack} className="flex-1">
              Back
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirm}
              isLoading={isChanging}
              className="flex-1"
            >
              {isDowngrade ? 'Confirm Downgrade' : 'Confirm Upgrade'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
};

// Backwards compatibility alias
export const UpgradeModal = ChangePlanModal;

export default ChangePlanModal;
