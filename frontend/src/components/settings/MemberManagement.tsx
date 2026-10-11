import { useState, useEffect, useMemo } from 'react';
import {
  UserPlus,
  Trash2,
  RefreshCw,
  Clock,
  UserX,
  UserCheck,
  ChevronDown,
  ChevronUp,
  Crown,
  Search,
  Shield,
  Eye,
  MessageSquare,
  Users,
  AlertTriangle,
} from 'lucide-react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import api from '../../services/api';

interface Member {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  orgRole: 'owner' | 'admin' | 'limited' | 'viewer' | 'reviewer';
  orgStatus: 'active' | 'pending' | 'inactive' | 'invited';
  joinedAt: string;
  createdAt?: string;
}

interface PendingInvitation {
  id: string;
  email: string;
  role: 'owner' | 'admin' | 'limited' | 'viewer' | 'reviewer';
  createdAt: string;
  expiresAt: string;
}

interface MemberManagementProps {
  organizationId: string;
  organizationName?: string;
  organizationOwnerId?: string;
  userRole?: string;
  userEmail?: string;
  userId?: string;
}

const roleConfig: Record<
  string,
  {
    bg: string;
    text: string;
    border: string;
    icon: React.ReactNode;
    description: string;
  }
> = {
  owner: {
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    border: 'border-purple-200',
    icon: <Crown className="w-3 h-3" />,
    description: 'Full control over organization settings, billing, and members',
  },
  admin: {
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    icon: <Shield className="w-3 h-3" />,
    description: 'Can manage members, tasks, and most organization settings',
  },
  viewer: {
    bg: 'bg-green-50',
    text: 'text-green-700',
    border: 'border-green-200',
    icon: <Eye className="w-3 h-3" />,
    description: 'Read-only access to tasks, recordings, and reviews',
  },
  reviewer: {
    bg: 'bg-orange-50',
    text: 'text-orange-700',
    border: 'border-orange-200',
    icon: <MessageSquare className="w-3 h-3" />,
    description: 'Can review and provide feedback on recordings',
  },
  limited: {
    bg: 'bg-gray-50',
    text: 'text-gray-600',
    border: 'border-gray-200',
    icon: <Users className="w-3 h-3" />,
    description: 'Restricted access - can only view recordings',
  },
};

// Confirmation Modal Component
const ConfirmModal = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  confirmVariant = 'danger',
  isLoading = false,
  requireTyping,
  typePhrase,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string | React.ReactNode;
  confirmText?: string;
  confirmVariant?: 'danger' | 'primary' | 'warning';
  isLoading?: boolean;
  requireTyping?: boolean;
  typePhrase?: string;
}) => {
  const [typedText, setTypedText] = useState('');

  useEffect(() => {
    if (!isOpen) setTypedText('');
  }, [isOpen]);

  if (!isOpen) return null;

  const canConfirm = !requireTyping || typedText === typePhrase;
  const variantClasses = {
    danger: 'bg-red-600 hover:bg-red-700 text-white',
    primary: 'bg-primary-600 hover:bg-primary-700 text-white',
    warning: 'bg-yellow-600 hover:bg-yellow-700 text-white',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
        <div className="text-gray-600 mb-4">{message}</div>

        {requireTyping && typePhrase && (
          <div className="mb-4">
            <p className="text-sm text-gray-500 mb-2">
              Type <span className="font-mono font-semibold text-gray-900">{typePhrase}</span> to
              confirm:
            </p>
            <input
              type="text"
              value={typedText}
              onChange={(e) => setTypedText(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder={typePhrase}
            />
          </div>
        )}

        <div className="flex justify-end space-x-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading || !canConfirm}
            className={`px-4 py-2 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed ${variantClasses[confirmVariant]}`}
          >
            {isLoading ? 'Processing...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

// Transfer Ownership Modal
const TransferOwnershipModal = ({
  isOpen,
  onClose,
  onConfirm,
  members,
  organizationName,
  isLoading,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (memberId: string) => void;
  members: Member[];
  organizationName: string;
  isLoading: boolean;
}) => {
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [confirmText, setConfirmText] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setSelectedMemberId('');
      setConfirmText('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const eligibleMembers = members.filter((m) => m.orgRole !== 'owner' && m.orgStatus === 'active');
  const selectedMember = eligibleMembers.find((m) => m.id === selectedMemberId);
  const canConfirm = selectedMemberId && confirmText === organizationName;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 p-6">
        <div className="flex items-center space-x-3 mb-4">
          <div className="p-2 bg-purple-100 rounded-lg">
            <Crown className="w-6 h-6 text-purple-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Transfer Ownership</h3>
            <p className="text-sm text-gray-500">This action cannot be undone</p>
          </div>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
          <div className="flex items-start space-x-2">
            <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-800">
              <p className="font-medium mb-1">Warning: You will lose owner privileges</p>
              <p>
                After transferring ownership, you will become an Admin. The new owner will have full
                control over the organization.
              </p>
            </div>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">Select New Owner</label>
          <select
            value={selectedMemberId}
            onChange={(e) => setSelectedMemberId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
            <option value="">Choose a member...</option>
            {eligibleMembers.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name || member.email} ({member.orgRole})
              </option>
            ))}
          </select>
          {selectedMember && (
            <p className="mt-2 text-sm text-gray-500">
              {selectedMember.name || selectedMember.email} will become the new owner
            </p>
          )}
        </div>

        {selectedMemberId && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Type <span className="font-mono text-gray-900">{organizationName}</span> to confirm
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder={organizationName}
            />
          </div>
        )}

        <div className="flex justify-end space-x-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(selectedMemberId)}
            disabled={isLoading || !canConfirm}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Transferring...' : 'Transfer Ownership'}
          </button>
        </div>
      </div>
    </div>
  );
};

const MemberManagement = ({
  organizationId,
  organizationName = 'this organization',
  organizationOwnerId,
  userRole,
  userEmail,
  userId: _userId,
}: MemberManagementProps) => {
  const [activeMembers, setActiveMembers] = useState<Member[]>([]);
  const [inactiveMembers, setInactiveMembers] = useState<Member[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [showInactiveSection, setShowInactiveSection] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'limited' | 'viewer' | 'admin' | 'reviewer'>(
    'limited'
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Search and filter
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  // Modals
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string | React.ReactNode;
    confirmText: string;
    confirmVariant: 'danger' | 'primary' | 'warning';
    onConfirm: () => void;
    requireTyping?: boolean;
    typePhrase?: string;
  } | null>(null);
  const [showTransferModal, setShowTransferModal] = useState(false);

  const isOwner = userRole === 'owner';
  const isAdmin = userRole === 'admin' || userRole === 'owner';

  // Filter members based on search and role filter
  const filteredActiveMembers = useMemo(() => {
    return activeMembers.filter((member) => {
      const matchesSearch =
        !searchQuery ||
        member.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (member.name && member.name.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesRole = roleFilter === 'all' || member.orgRole === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [activeMembers, searchQuery, roleFilter]);

  // Clear message after 5 seconds
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 5000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [message]);

  const fetchData = async () => {
    try {
      setIsLoading(true);

      // Fetch members (all users can see this)
      const [activeMembersRes, inactiveMembersRes] = await Promise.all([
        api.get(`/organizations/${organizationId}/members?status=active&limit=100`),
        api.get(`/organizations/${organizationId}/members?status=inactive&limit=100`),
      ]);

      setActiveMembers(activeMembersRes.data?.data?.members || []);
      setInactiveMembers(inactiveMembersRes.data?.data?.members || []);

      // Only admins can view pending invitations
      if (isAdmin) {
        try {
          const invitationsRes = await api.get(
            `/organizations/${organizationId}/members/invitations/pending`
          );
          setPendingInvitations(invitationsRes.data?.data?.invitations || []);
        } catch {
          // Silently fail for invitations - user may not have admin access
          setPendingInvitations([]);
        }
      } else {
        setPendingInvitations([]);
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to fetch data' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, isAdmin]);

  const handleSendInvite = async () => {
    if (!inviteEmail) {
      setMessage({ type: 'error', text: 'Please enter an email address' });
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await api.post(`/organizations/${organizationId}/members/invite`, {
        email: inviteEmail,
        role: inviteRole,
      });

      if (!response.data.success) {
        setMessage({ type: 'error', text: response.data.error || 'Failed to send invitation' });
        return;
      }

      setMessage({ type: 'success', text: `Invitation sent to ${inviteEmail}` });
      setInviteEmail('');
      setInviteRole('limited');
      setShowInviteForm(false);
      fetchData();
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to send invitation',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendInvitation = async (invitationId: string, email: string) => {
    try {
      await api.post(`/organizations/${organizationId}/members/invitations/${invitationId}/resend`);
      setMessage({ type: 'success', text: `Invitation resent to ${email}` });
      fetchData();
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error.response?.data?.error || error.message || 'Failed to resend invitation',
      });
    }
  };

  const handleCancelInvitation = (invitationId: string, email: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Cancel Invitation',
      message: `Are you sure you want to cancel the invitation to ${email}?`,
      confirmText: 'Cancel Invitation',
      confirmVariant: 'danger',
      onConfirm: async () => {
        try {
          await api.delete(`/organizations/${organizationId}/members/invitations/${invitationId}`);
          setMessage({ type: 'success', text: `Invitation to ${email} cancelled` });
          setPendingInvitations(pendingInvitations.filter((inv) => inv.id !== invitationId));
        } catch (error: any) {
          setMessage({
            type: 'error',
            text: error.response?.data?.error || 'Failed to cancel invitation',
          });
        }
        setConfirmModal(null);
      },
    });
  };

  const handleUpdateInvitationRole = async (invitationId: string, newRole: string) => {
    try {
      await api.put(`/organizations/${organizationId}/members/invitations/${invitationId}/role`, {
        role: newRole,
      });
      setPendingInvitations(
        pendingInvitations.map((inv) =>
          inv.id === invitationId ? { ...inv, role: newRole as any } : inv
        )
      );
      setMessage({ type: 'success', text: 'Invitation role updated' });
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error.response?.data?.error || 'Failed to update invitation role',
      });
    }
  };

  const handleChangeRole = async (memberId: string, newRole: string) => {
    try {
      await api.put(`/organizations/${organizationId}/members/${memberId}/role`, { role: newRole });
      setActiveMembers(
        activeMembers.map((m) => (m.id === memberId ? { ...m, orgRole: newRole as any } : m))
      );
      setMessage({ type: 'success', text: 'Role updated successfully' });
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error.response?.data?.error || error.message || 'Failed to update role',
      });
    }
  };

  const handleDeactivateMember = (memberId: string, memberEmail: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Deactivate Member',
      message: (
        <div>
          <p>
            Are you sure you want to deactivate <strong>{memberEmail}</strong>?
          </p>
          <p className="mt-2 text-sm text-gray-500">
            They will lose access but can be reactivated later.
          </p>
        </div>
      ),
      confirmText: 'Deactivate',
      confirmVariant: 'warning',
      onConfirm: async () => {
        try {
          await api.put(`/organizations/${organizationId}/members/${memberId}/status`, {
            status: 'inactive',
          });
          const deactivatedMember = activeMembers.find((m) => m.id === memberId);
          if (deactivatedMember) {
            setActiveMembers(activeMembers.filter((m) => m.id !== memberId));
            setInactiveMembers([
              ...inactiveMembers,
              { ...deactivatedMember, orgStatus: 'inactive' },
            ]);
          }
          setMessage({ type: 'success', text: `${memberEmail} has been deactivated` });
        } catch (error: any) {
          setMessage({
            type: 'error',
            text: error.response?.data?.error || error.message || 'Failed to deactivate member',
          });
        }
        setConfirmModal(null);
      },
    });
  };

  const handleReactivateMember = async (memberId: string, memberEmail: string) => {
    try {
      await api.put(`/organizations/${organizationId}/members/${memberId}/status`, {
        status: 'active',
      });
      const reactivatedMember = inactiveMembers.find((m) => m.id === memberId);
      if (reactivatedMember) {
        setInactiveMembers(inactiveMembers.filter((m) => m.id !== memberId));
        setActiveMembers([...activeMembers, { ...reactivatedMember, orgStatus: 'active' }]);
      }
      setMessage({ type: 'success', text: `${memberEmail} has been reactivated` });
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error.response?.data?.error || error.message || 'Failed to reactivate member',
      });
    }
  };

  const handleRemoveMember = (memberId: string, memberEmail: string, isInactive: boolean) => {
    setConfirmModal({
      isOpen: true,
      title: 'Remove Member',
      message: (
        <div>
          <p>
            Are you sure you want to permanently remove <strong>{memberEmail}</strong>?
          </p>
          <p className="mt-2 text-sm text-red-600">This action cannot be undone.</p>
        </div>
      ),
      confirmText: 'Remove Permanently',
      confirmVariant: 'danger',
      onConfirm: async () => {
        try {
          await api.delete(`/organizations/${organizationId}/members/${memberId}`);
          if (isInactive) {
            setInactiveMembers(inactiveMembers.filter((m) => m.id !== memberId));
          } else {
            setActiveMembers(activeMembers.filter((m) => m.id !== memberId));
          }
          setMessage({ type: 'success', text: `${memberEmail} has been removed` });
        } catch (error: any) {
          setMessage({
            type: 'error',
            text: error.response?.data?.error || error.message || 'Failed to remove member',
          });
        }
        setConfirmModal(null);
      },
    });
  };

  const handleTransferOwnership = async (newOwnerId: string) => {
    setIsSubmitting(true);
    try {
      await api.post(`/organizations/${organizationId}/members/${newOwnerId}/transfer-ownership`);
      setMessage({ type: 'success', text: 'Ownership transferred successfully' });
      setShowTransferModal(false);
      fetchData();
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error.response?.data?.error || error.message || 'Failed to transfer ownership',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Check if member can be managed (role changed, deactivated, removed)
  const canManageMember = (member: Member): boolean => {
    if (!isAdmin) return false;
    if (member.email === userEmail) return false; // Can't manage yourself
    // Owners can manage anyone, admins can manage non-owners
    if (member.orgRole === 'owner' && !isOwner) return false;
    return true;
  };

  // Get available roles for a member (based on who's making the change)
  const getAvailableRoles = (_member: Member): string[] => {
    // Owner can assign any role except owner (use transfer for that)
    if (isOwner) {
      return ['admin', 'reviewer', 'viewer', 'limited'];
    }
    // Admin can't assign owner role
    return ['admin', 'reviewer', 'viewer', 'limited'];
  };

  if (isLoading) {
    return <div className="text-center py-8">Loading members...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Messages */}
      {message && (
        <div
          className={`p-4 rounded-lg text-sm ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Header with Invite Button */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Team Members</h3>
          <p className="text-sm text-gray-600 mt-1">Manage who has access to your organization</p>
        </div>
        {isAdmin && (
          <Button
            variant="primary"
            onClick={() => setShowInviteForm(!showInviteForm)}
            icon={<UserPlus className="w-4 h-4" />}
          >
            Invite Member
          </Button>
        )}
      </div>

      {/* Invite Form */}
      {showInviteForm && isAdmin && (
        <Card className="border-primary-200 bg-primary-50">
          <div className="space-y-4">
            <h4 className="font-semibold text-gray-900">Send Invitation</h4>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="user@example.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Role</label>
              <select
                value={inviteRole}
                onChange={(e) =>
                  setInviteRole(e.target.value as 'limited' | 'viewer' | 'admin' | 'reviewer')
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                <option value="limited">Limited</option>
                <option value="viewer">Viewer</option>
                <option value="reviewer">Reviewer</option>
                <option value="admin">Admin</option>
              </select>
              <p className="text-xs text-gray-600 mt-1">{roleConfig[inviteRole]?.description}</p>
            </div>

            <div className="flex space-x-3">
              <Button
                variant="primary"
                onClick={handleSendInvite}
                disabled={isSubmitting || !inviteEmail}
              >
                {isSubmitting ? 'Sending...' : 'Send Invitation'}
              </Button>
              <Button variant="secondary" onClick={() => setShowInviteForm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Search and Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        >
          <option value="all">All Roles</option>
          <option value="owner">Owners</option>
          <option value="admin">Admins</option>
          <option value="reviewer">Reviewers</option>
          <option value="viewer">Viewers</option>
          <option value="limited">Limited</option>
        </select>
      </div>

      {/* Active Members */}
      <Card className="p-6">
        <h4 className="text-lg font-semibold text-gray-900 mb-4">
          Active Members ({filteredActiveMembers.length}
          {searchQuery || roleFilter !== 'all' ? ` of ${activeMembers.length}` : ''})
        </h4>

        {filteredActiveMembers.length === 0 ? (
          <p className="text-center text-gray-600 py-8">
            {searchQuery || roleFilter !== 'all'
              ? 'No members match your filters'
              : 'No active members'}
          </p>
        ) : (
          <div className="space-y-3">
            {filteredActiveMembers.map((member) => {
              const config = roleConfig[member.orgRole] || roleConfig.member;
              const isOwnMembership = member.email === userEmail;
              const displayName = member.name || member.email;
              const joinDate = member.joinedAt || member.createdAt;
              const canManage = canManageMember(member);

              return (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200 hover:border-gray-300 transition"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-3">
                      {member.avatarUrl ? (
                        <img
                          src={member.avatarUrl}
                          alt={displayName}
                          className="w-10 h-10 rounded-full flex-shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-primary-500 flex items-center justify-center text-sm font-semibold text-white flex-shrink-0">
                          {displayName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">
                          {displayName}
                          {member.id === organizationOwnerId && (
                            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 border border-purple-200">
                              <Crown className="w-3 h-3 mr-1" />
                              Account Owner
                            </span>
                          )}
                          {isOwnMembership && (
                            <span className="ml-2 text-xs text-gray-500">(You)</span>
                          )}
                        </p>
                        {member.name && (
                          <p className="text-xs text-gray-500 truncate">{member.email}</p>
                        )}
                        {joinDate && (
                          <p className="text-xs text-gray-400">
                            Joined{' '}
                            {new Date(joinDate).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 ml-4">
                    {/* Role Badge or Dropdown */}
                    {canManage ? (
                      <div className="relative group">
                        <select
                          value={member.orgRole}
                          onChange={(e) => handleChangeRole(member.id, e.target.value)}
                          className={`px-3 py-1.5 text-sm rounded-lg border ${config.border} ${config.bg} font-medium cursor-pointer appearance-none pr-8`}
                          title={config.description}
                        >
                          {getAvailableRoles(member).map((role) => (
                            <option key={role} value={role}>
                              {role.charAt(0).toUpperCase() + role.slice(1)}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-gray-400" />
                      </div>
                    ) : (
                      <span
                        className={`inline-flex items-center space-x-1.5 px-3 py-1.5 text-sm rounded-lg border font-medium ${config.border} ${config.bg}`}
                        title={config.description}
                      >
                        {config.icon}
                        <span>
                          {member.orgRole.charAt(0).toUpperCase() + member.orgRole.slice(1)}
                        </span>
                      </span>
                    )}

                    {/* Transfer Ownership Button (Owner only, for other members) */}
                    {isOwner && !isOwnMembership && member.orgRole !== 'owner' && (
                      <button
                        onClick={() => setShowTransferModal(true)}
                        className="p-2 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition"
                        title="Transfer ownership to this member"
                      >
                        <Crown className="w-4 h-4" />
                      </button>
                    )}

                    {/* Deactivate Button */}
                    {canManage && (
                      <button
                        onClick={() => handleDeactivateMember(member.id, member.email)}
                        className="p-2 text-gray-400 hover:text-yellow-600 hover:bg-yellow-50 rounded-lg transition"
                        title="Deactivate member"
                      >
                        <UserX className="w-4 h-4" />
                      </button>
                    )}

                    {/* Remove Button */}
                    {canManage && (
                      <button
                        onClick={() => handleRemoveMember(member.id, member.email, false)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                        title="Remove permanently"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Inactive Members (Collapsible) */}
      {inactiveMembers.length > 0 && (
        <Card className="p-6">
          <button
            onClick={() => setShowInactiveSection(!showInactiveSection)}
            className="w-full flex items-center justify-between text-left"
          >
            <h4 className="text-lg font-semibold text-gray-900">
              Inactive Members ({inactiveMembers.length})
            </h4>
            {showInactiveSection ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </button>

          {showInactiveSection && (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-gray-500 mb-4">
                These members have been deactivated and no longer have access to the organization.
              </p>
              {inactiveMembers.map((member) => {
                const displayName = member.name || member.email;

                return (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-4 bg-gray-100 rounded-lg border border-gray-200 opacity-75"
                  >
                    <div className="flex-1">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-full bg-gray-400 flex items-center justify-center text-sm font-semibold text-white">
                          {displayName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-gray-700">{displayName}</p>
                          {member.name && <p className="text-xs text-gray-500">{member.email}</p>}
                          <p className="text-xs text-red-500">Deactivated</p>
                        </div>
                      </div>
                    </div>

                    {isAdmin && (
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleReactivateMember(member.id, member.email)}
                          className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition flex items-center"
                          title="Reactivate member"
                        >
                          <UserCheck className="w-4 h-4 mr-1" />
                          <span className="text-sm">Reactivate</span>
                        </button>
                        <button
                          onClick={() => handleRemoveMember(member.id, member.email, true)}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                          title="Remove permanently"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* Pending Invitations */}
      {pendingInvitations.length > 0 && (
        <Card className="p-6">
          <h4 className="text-lg font-semibold text-gray-900 mb-4">
            Pending Invitations ({pendingInvitations.length})
          </h4>

          <div className="space-y-3">
            {pendingInvitations.map((invitation) => {
              const config = roleConfig[invitation.role] || roleConfig.member;
              const expiresIn = Math.ceil(
                (new Date(invitation.expiresAt).getTime() - new Date().getTime()) /
                  (1000 * 60 * 60 * 24)
              );

              return (
                <div
                  key={invitation.id}
                  className="flex items-center justify-between p-4 bg-yellow-50 rounded-lg border border-yellow-200"
                >
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <Clock className="w-5 h-5 text-yellow-600 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-gray-900">{invitation.email}</p>
                        <p className="text-xs text-yellow-700">
                          Expires in {expiresIn} day{expiresIn === 1 ? '' : 's'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    {isAdmin ? (
                      <>
                        <select
                          value={invitation.role}
                          onChange={(e) =>
                            handleUpdateInvitationRole(invitation.id, e.target.value)
                          }
                          className={`px-2 py-1 text-sm rounded border ${config.border} ${config.bg} font-medium`}
                        >
                          <option value="limited">Limited</option>
                          <option value="viewer">Viewer</option>
                          <option value="reviewer">Reviewer</option>
                          <option value="admin">Admin</option>
                        </select>
                        <button
                          onClick={() => handleResendInvitation(invitation.id, invitation.email)}
                          className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition"
                          title="Resend invitation"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleCancelInvitation(invitation.id, invitation.email)}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                          title="Cancel invitation"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <span
                        className={`px-3 py-1 text-sm rounded border font-medium ${config.border} ${config.bg}`}
                      >
                        {invitation.role.charAt(0).toUpperCase() + invitation.role.slice(1)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Confirmation Modal */}
      {confirmModal && (
        <ConfirmModal
          isOpen={confirmModal.isOpen}
          onClose={() => setConfirmModal(null)}
          onConfirm={confirmModal.onConfirm}
          title={confirmModal.title}
          message={confirmModal.message}
          confirmText={confirmModal.confirmText}
          confirmVariant={confirmModal.confirmVariant}
          isLoading={isSubmitting}
          requireTyping={confirmModal.requireTyping}
          typePhrase={confirmModal.typePhrase}
        />
      )}

      {/* Transfer Ownership Modal */}
      <TransferOwnershipModal
        isOpen={showTransferModal}
        onClose={() => setShowTransferModal(false)}
        onConfirm={handleTransferOwnership}
        members={activeMembers}
        organizationName={organizationName}
        isLoading={isSubmitting}
      />
    </div>
  );
};

export default MemberManagement;
