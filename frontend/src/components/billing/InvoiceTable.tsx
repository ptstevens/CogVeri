import { Download, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react';
import Button from '../ui/Button';
import { Invoice } from '../../services/billing.api';
import { formatBillingDate, formatCurrency } from '../../hooks/useBilling';

export interface InvoiceTableProps {
  invoices: Invoice[];
  hasMore: boolean;
  isLoading?: boolean;
  onLoadMore?: () => void;
  onLoadPrevious?: () => void;
  hasPrevious?: boolean;
}

const InvoiceTable = ({
  invoices,
  hasMore,
  isLoading = false,
  onLoadMore,
  onLoadPrevious,
  hasPrevious = false,
}: InvoiceTableProps) => {
  const getStatusBadge = (status: Invoice['status']) => {
    const styles: Record<Invoice['status'], { bg: string; text: string; label: string }> = {
      paid: { bg: 'bg-success-50', text: 'text-success-700', label: 'Paid' },
      open: { bg: 'bg-warning-50', text: 'text-warning-700', label: 'Open' },
      draft: { bg: 'bg-gray-50', text: 'text-gray-700', label: 'Draft' },
      uncollectible: { bg: 'bg-error-50', text: 'text-error-700', label: 'Uncollectible' },
      void: { bg: 'bg-gray-50', text: 'text-gray-500', label: 'Void' },
    };

    const style = styles[status] || styles.draft;

    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
        {style.label}
      </span>
    );
  };

  if (invoices.length === 0) {
    return (
      <div className="text-center py-12 bg-gray-50 rounded-xl border border-gray-200">
        <div className="text-gray-400 mb-2">
          <Download className="w-12 h-12 mx-auto" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-1">No invoices yet</h3>
        <p className="text-gray-500 text-sm">
          Your invoice history will appear here once you have paid invoices.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200">
      {/* Desktop Table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Invoice
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Date
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Amount
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {invoices.map((invoice) => (
              <tr key={invoice.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-4">
                  <span className="font-medium text-gray-900">{invoice.number || invoice.id}</span>
                </td>
                <td className="px-4 py-4 text-gray-600">
                  {formatBillingDate(invoice.date)}
                </td>
                <td className="px-4 py-4">
                  <span className="font-medium text-gray-900">
                    {formatCurrency(invoice.amount, invoice.currency)}
                  </span>
                </td>
                <td className="px-4 py-4">
                  {getStatusBadge(invoice.status)}
                </td>
                <td className="px-4 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {invoice.hostedInvoiceUrl && (
                      <a
                        href={invoice.hostedInvoiceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 text-gray-400 hover:text-gray-600 transition-colors rounded-lg hover:bg-gray-100"
                        title="View invoice"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                    {invoice.pdfUrl && (
                      <a
                        href={invoice.pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 text-gray-400 hover:text-primary-600 transition-colors rounded-lg hover:bg-primary-50"
                        title="Download PDF"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile List */}
      <div className="md:hidden divide-y divide-gray-100">
        {invoices.map((invoice) => (
          <div key={invoice.id} className="p-4 bg-white">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="font-medium text-gray-900">{invoice.number || invoice.id}</p>
                <p className="text-sm text-gray-500">{formatBillingDate(invoice.date)}</p>
              </div>
              {getStatusBadge(invoice.status)}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-lg font-semibold text-gray-900">
                {formatCurrency(invoice.amount, invoice.currency)}
              </span>
              <div className="flex items-center gap-2">
                {invoice.hostedInvoiceUrl && (
                  <a
                    href={invoice.hostedInvoiceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 text-gray-400 hover:text-gray-600"
                  >
                    <ExternalLink className="w-5 h-5" />
                  </a>
                )}
                {invoice.pdfUrl && (
                  <a
                    href={invoice.pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 text-primary-600"
                  >
                    <Download className="w-5 h-5" />
                  </a>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {(hasMore || hasPrevious) && (
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-t border-gray-200">
          <Button
            variant="ghost"
            size="sm"
            onClick={onLoadPrevious}
            disabled={!hasPrevious || isLoading}
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Previous
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onLoadMore}
            disabled={!hasMore || isLoading}
            isLoading={isLoading}
          >
            Next
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
};

export default InvoiceTable;
