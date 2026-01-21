import { CreditCard, Trash2, Star } from 'lucide-react';
import Button from '../ui/Button';
import { PaymentMethod } from '../../services/billing.api';

export interface PaymentMethodCardProps {
  paymentMethod: PaymentMethod;
  onRemove: (id: string) => void;
  onSetDefault: (id: string) => void;
  isRemoving?: boolean;
  isSettingDefault?: boolean;
}

const PaymentMethodCard = ({
  paymentMethod,
  onRemove,
  onSetDefault,
  isRemoving = false,
  isSettingDefault = false,
}: PaymentMethodCardProps) => {
  const { id, brand, last4, expMonth, expYear, isDefault } = paymentMethod;

  const getBrandIcon = (brandName: string) => {
    const brandLower = brandName.toLowerCase();

    // Brand colors
    const brandColors: Record<string, string> = {
      visa: 'text-blue-600',
      mastercard: 'text-orange-500',
      amex: 'text-blue-500',
      discover: 'text-orange-600',
      default: 'text-gray-500',
    };

    return (
      <div className={`flex items-center gap-2 ${brandColors[brandLower] || brandColors.default}`}>
        <CreditCard className="w-6 h-6" />
        <span className="font-medium capitalize">{brandName}</span>
      </div>
    );
  };

  const isExpired = () => {
    const now = new Date();
    const expDate = new Date(expYear, expMonth - 1); // Month is 0-indexed
    return now > expDate;
  };

  const formatExpiry = () => {
    const month = expMonth.toString().padStart(2, '0');
    const year = expYear.toString().slice(-2);
    return `${month}/${year}`;
  };

  return (
    <div
      className={`relative p-4 rounded-xl border-2 transition-all ${
        isDefault
          ? 'border-primary-200 bg-primary-50'
          : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      {isDefault && (
        <div className="absolute -top-2 -right-2">
          <span className="inline-flex items-center gap-1 bg-primary-600 text-white text-xs px-2 py-0.5 rounded-full">
            <Star className="w-3 h-3 fill-current" />
            Default
          </span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {getBrandIcon(brand)}

          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-gray-900">****</span>
              <span className="font-mono text-gray-900">{last4}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className={isExpired() ? 'text-error' : 'text-gray-500'}>
                Expires {formatExpiry()}
              </span>
              {isExpired() && (
                <span className="text-xs font-medium text-error bg-error-50 px-2 py-0.5 rounded">
                  Expired
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isDefault && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onSetDefault(id)}
              isLoading={isSettingDefault}
              disabled={isSettingDefault || isRemoving}
            >
              Set as default
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onRemove(id)}
            isLoading={isRemoving}
            disabled={isRemoving || isSettingDefault || isDefault}
            className="text-gray-400 hover:text-error"
            title={isDefault ? 'Cannot remove default payment method' : 'Remove payment method'}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PaymentMethodCard;
