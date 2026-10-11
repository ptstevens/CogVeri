import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { Shield, CheckCircle, ArrowRight } from 'lucide-react';

interface DomainClaimingPromptProps {
  isOpen: boolean;
  onClose: () => void;
  organizationId: string;
  suggestedDomain: string | null;
  organizationName: string;
}

/**
 * Modal shown after a user upgrades to a paid plan.
 * Prompts them to claim their domain to prevent others from creating
 * separate organizations with the same email domain.
 */
const DomainClaimingPrompt = ({
  isOpen,
  onClose,
  suggestedDomain,
  organizationName,
}: DomainClaimingPromptProps) => {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);

  const handleClaimDomain = () => {
    // Navigate to domain settings to start verification
    navigate('/settings/organization?tab=domain');
    onClose();
  };

  const handleMaybeLater = () => {
    setDismissed(true);
    onClose();
  };

  if (!suggestedDomain) {
    // No claimable domain (e.g., gmail.com user)
    return null;
  }

  return (
    <Modal
      isOpen={isOpen && !dismissed}
      onClose={onClose}
      size="md"
      showCloseButton={false}
      closeOnBackdrop={false}
    >
      <div className="text-center py-4">
        {/* Icon */}
        <div className="mx-auto w-16 h-16 bg-gradient-to-br from-primary-100 to-blue-100 rounded-full flex items-center justify-center mb-6">
          <Shield className="w-8 h-8 text-primary-600" />
        </div>

        {/* Title */}
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Congratulations on upgrading! 🎉</h2>

        {/* Description */}
        <p className="text-gray-600 mb-6 max-w-md mx-auto">
          As a paid subscriber, you can now <strong>claim your organization's domain</strong>. This
          will ensure that new team members with <strong>@{suggestedDomain}</strong> email addresses
          join <strong>{organizationName}</strong> instead of creating separate accounts.
        </p>

        {/* Benefits list */}
        <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left max-w-sm mx-auto">
          <p className="text-sm font-medium text-gray-700 mb-3">
            Benefits of claiming your domain:
          </p>
          <ul className="space-y-2">
            <li className="flex items-center text-sm text-gray-600">
              <CheckCircle className="w-4 h-4 text-green-500 mr-2 flex-shrink-0" />
              <span>New @{suggestedDomain} users directed to join your org</span>
            </li>
            <li className="flex items-center text-sm text-gray-600">
              <CheckCircle className="w-4 h-4 text-green-500 mr-2 flex-shrink-0" />
              <span>Centralized billing and team management</span>
            </li>
            <li className="flex items-center text-sm text-gray-600">
              <CheckCircle className="w-4 h-4 text-green-500 mr-2 flex-shrink-0" />
              <span>Prevent duplicate organizations</span>
            </li>
          </ul>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button variant="secondary" onClick={handleMaybeLater} className="order-2 sm:order-1">
            Maybe Later
          </Button>
          <Button variant="primary" onClick={handleClaimDomain} className="order-1 sm:order-2">
            Claim @{suggestedDomain}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>

        {/* Subtle note */}
        <p className="text-xs text-gray-400 mt-4">
          You can always claim your domain later from Organization Settings → Domain
        </p>
      </div>
    </Modal>
  );
};

export default DomainClaimingPrompt;
