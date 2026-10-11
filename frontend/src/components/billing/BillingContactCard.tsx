import { useState } from 'react';
import { Mail, User, Edit2, Save, X, Info } from 'lucide-react';
import { useBillingContact, useUpdateBillingContact } from '../../hooks/useBilling';
import Card from '../ui/Card';
import Button from '../ui/Button';
import LoadingSpinner from '../ui/LoadingSpinner';

const BillingContactCard = () => {
  const { data: billingContact, isLoading, error } = useBillingContact();
  const updateBillingContact = useUpdateBillingContact();

  const [isEditing, setIsEditing] = useState(false);
  const [billingEmail, setBillingEmail] = useState('');
  const [billingName, setBillingName] = useState('');

  const startEditing = () => {
    setBillingEmail(billingContact?.billingContact.email || '');
    setBillingName(billingContact?.billingContact.name || '');
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setBillingEmail('');
    setBillingName('');
  };

  const handleSave = async () => {
    if (!billingEmail || !billingName) return;

    await updateBillingContact.mutateAsync({
      billingEmail,
      billingName,
    });
    setIsEditing(false);
  };

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center py-8">
          <LoadingSpinner size="sm" />
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-6">
        <div className="text-center py-4 text-gray-500">
          Failed to load billing contact information.
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Billing Contact</h3>
        {!isEditing && (
          <Button variant="ghost" size="sm" onClick={startEditing}>
            <Edit2 className="w-4 h-4 mr-1" />
            Edit
          </Button>
        )}
      </div>

      {isEditing ? (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Billing Name</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={billingName}
                onChange={(e) => setBillingName(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="Enter billing contact name"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Billing Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="email"
                value={billingEmail}
                onChange={(e) => setBillingEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="Enter billing email address"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              isLoading={updateBillingContact.isPending}
            >
              <Save className="w-4 h-4 mr-1" />
              Save
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={cancelEditing}
              disabled={updateBillingContact.isPending}
            >
              <X className="w-4 h-4 mr-1" />
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <User className="w-5 h-5 text-gray-400" />
            <div>
              <div className="text-sm text-gray-500">Name</div>
              <div className="font-medium text-gray-900">
                {billingContact?.billingContact.name || 'Not set'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Mail className="w-5 h-5 text-gray-400" />
            <div>
              <div className="text-sm text-gray-500">Email</div>
              <div className="font-medium text-gray-900">
                {billingContact?.billingContact.email || 'Not set'}
              </div>
            </div>
          </div>

          {billingContact?.isDifferentFromSubscriber && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-blue-800">
                  <span className="font-medium">Subscriber will be copied:</span> All billing emails
                  will also be sent to{' '}
                  <span className="font-medium">{billingContact.subscriber.email}</span> (account
                  owner).
                </div>
              </div>
            </div>
          )}

          <p className="text-sm text-gray-500 mt-4">
            The billing contact receives all invoices, payment receipts, and billing-related emails.
            This can be someone outside your organization, such as an accounting department.
          </p>
        </div>
      )}
    </Card>
  );
};

export default BillingContactCard;
