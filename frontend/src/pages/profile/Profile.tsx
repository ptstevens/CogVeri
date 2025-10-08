import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import { toast } from 'react-hot-toast';
import axios from 'axios';
import {
  UserIcon,
  EnvelopeIcon,
  BriefcaseIcon,
  BuildingOfficeIcon,
  KeyIcon,
  BellIcon,
  CameraIcon
} from '@heroicons/react/24/outline';

const Profile = () => {
  const { user } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [profileData, setProfileData] = useState({
    name: '',
    email: '',
    department: '',
    jobTitle: '',
    phone: '',
    bio: ''
  });

  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  const [notificationPreferences, setNotificationPreferences] = useState({
    emailNotifications: true,
    inAppNotifications: true,
    slackNotifications: false,
    taskAssignments: true,
    reviewRequests: true,
    completionUpdates: true
  });

  useEffect(() => {
    if (user) {
      setProfileData({
        name: user.name || '',
        email: user.email || '',
        department: user.department || '',
        jobTitle: user.jobTitle || '',
        phone: user.phone || '',
        bio: user.bio || ''
      });
    }
  }, [user]);

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await axios.put(
        `${import.meta.env.VITE_API_URL}/users/profile`,
        profileData,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`
          }
        }
      );

      toast.success('Profile updated successfully');
      setIsEditing(false);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to update profile');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (passwordData.newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    setIsLoading(true);

    try {
      await axios.post(
        `${import.meta.env.VITE_API_URL}/auth/change-password`,
        {
          currentPassword: passwordData.currentPassword,
          newPassword: passwordData.newPassword
        },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`
          }
        }
      );

      toast.success('Password changed successfully');
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
      setIsChangingPassword(false);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to change password');
    } finally {
      setIsLoading(false);
    }
  };

  const handleNotificationUpdate = async () => {
    setIsLoading(true);

    try {
      await axios.put(
        `${import.meta.env.VITE_API_URL}/users/notifications`,
        notificationPreferences,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`
          }
        }
      );

      toast.success('Notification preferences updated');
    } catch (error: any) {
      toast.error('Failed to update notification preferences');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Profile Settings</h1>
        <p className="text-gray-600">Manage your account settings and preferences</p>
      </div>

      {/* Profile Information */}
      <Card className="mb-6">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">Profile Information</h2>
            {!isEditing && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsEditing(true)}
              >
                Edit Profile
              </Button>
            )}
          </div>

          {/* Avatar Section */}
          <div className="flex items-center mb-6">
            <div className="relative">
              <div className="w-24 h-24 bg-primary-100 rounded-full flex items-center justify-center">
                <span className="text-3xl font-semibold text-primary-600">
                  {user?.name?.charAt(0).toUpperCase()}
                </span>
              </div>
              <button className="absolute bottom-0 right-0 p-1.5 bg-white rounded-full shadow-md border border-gray-200 hover:bg-gray-50">
                <CameraIcon className="w-4 h-4 text-gray-600" />
              </button>
            </div>
            <div className="ml-6">
              <h3 className="text-lg font-medium text-gray-900">{user?.name}</h3>
              <p className="text-sm text-gray-500 capitalize">{user?.role}</p>
            </div>
          </div>

          {isEditing ? (
            <form onSubmit={handleProfileUpdate} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Full Name
                  </label>
                  <div className="relative">
                    <UserIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={profileData.name}
                      onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
                      className="pl-10 input"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <div className="relative">
                    <EnvelopeIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="email"
                      value={profileData.email}
                      className="pl-10 input bg-gray-50"
                      disabled
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Department
                  </label>
                  <div className="relative">
                    <BuildingOfficeIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <select
                      value={profileData.department}
                      onChange={(e) => setProfileData({ ...profileData, department: e.target.value })}
                      className="pl-10 input"
                    >
                      <option value="">Select Department</option>
                      <option value="Engineering">Engineering</option>
                      <option value="Product">Product</option>
                      <option value="Design">Design</option>
                      <option value="Marketing">Marketing</option>
                      <option value="Sales">Sales</option>
                      <option value="Support">Support</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Job Title
                  </label>
                  <div className="relative">
                    <BriefcaseIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={profileData.jobTitle}
                      onChange={(e) => setProfileData({ ...profileData, jobTitle: e.target.value })}
                      className="pl-10 input"
                      placeholder="e.g., Software Engineer"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Bio
                </label>
                <textarea
                  value={profileData.bio}
                  onChange={(e) => setProfileData({ ...profileData, bio: e.target.value })}
                  rows={3}
                  className="input"
                  placeholder="Tell us about yourself..."
                />
              </div>

              <div className="flex justify-end space-x-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setIsEditing(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" isLoading={isLoading}>
                  Save Changes
                </Button>
              </div>
            </form>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Name</p>
                <p className="font-medium">{profileData.name || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Email</p>
                <p className="font-medium">{profileData.email}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Department</p>
                <p className="font-medium">{profileData.department || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Job Title</p>
                <p className="font-medium">{profileData.jobTitle || '-'}</p>
              </div>
              {profileData.bio && (
                <div className="md:col-span-2">
                  <p className="text-sm text-gray-500">Bio</p>
                  <p className="font-medium">{profileData.bio}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Password Change */}
      <Card className="mb-6">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center">
              <KeyIcon className="w-5 h-5 text-gray-400 mr-2" />
              <h2 className="text-lg font-semibold text-gray-900">Password & Security</h2>
            </div>
            {!isChangingPassword && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsChangingPassword(true)}
              >
                Change Password
              </Button>
            )}
          </div>

          {isChangingPassword && (
            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Current Password
                </label>
                <input
                  type="password"
                  value={passwordData.currentPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                  className="input"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  New Password
                </label>
                <input
                  type="password"
                  value={passwordData.newPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                  className="input"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={passwordData.confirmPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                  className="input"
                  required
                />
              </div>

              <div className="flex justify-end space-x-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setIsChangingPassword(false);
                    setPasswordData({
                      currentPassword: '',
                      newPassword: '',
                      confirmPassword: ''
                    });
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" isLoading={isLoading}>
                  Update Password
                </Button>
              </div>
            </form>
          )}
        </div>
      </Card>

      {/* Notification Preferences */}
      <Card>
        <div className="p-6">
          <div className="flex items-center mb-6">
            <BellIcon className="w-5 h-5 text-gray-400 mr-2" />
            <h2 className="text-lg font-semibold text-gray-900">Notification Preferences</h2>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">Email Notifications</p>
                <p className="text-sm text-gray-500">Receive notifications via email</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={notificationPreferences.emailNotifications}
                  onChange={(e) => setNotificationPreferences({
                    ...notificationPreferences,
                    emailNotifications: e.target.checked
                  })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
              </label>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">In-App Notifications</p>
                <p className="text-sm text-gray-500">Show notifications within the application</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={notificationPreferences.inAppNotifications}
                  onChange={(e) => setNotificationPreferences({
                    ...notificationPreferences,
                    inAppNotifications: e.target.checked
                  })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
              </label>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">Slack Notifications</p>
                <p className="text-sm text-gray-500">Send notifications to Slack</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={notificationPreferences.slackNotifications}
                  onChange={(e) => setNotificationPreferences({
                    ...notificationPreferences,
                    slackNotifications: e.target.checked
                  })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
              </label>
            </div>

            <hr className="my-4" />

            <h3 className="font-medium text-gray-900 mb-3">Notify me about:</h3>

            <div className="space-y-3">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={notificationPreferences.taskAssignments}
                  onChange={(e) => setNotificationPreferences({
                    ...notificationPreferences,
                    taskAssignments: e.target.checked
                  })}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="ml-2 text-gray-700">New task assignments</span>
              </label>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={notificationPreferences.reviewRequests}
                  onChange={(e) => setNotificationPreferences({
                    ...notificationPreferences,
                    reviewRequests: e.target.checked
                  })}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="ml-2 text-gray-700">Review requests</span>
              </label>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={notificationPreferences.completionUpdates}
                  onChange={(e) => setNotificationPreferences({
                    ...notificationPreferences,
                    completionUpdates: e.target.checked
                  })}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="ml-2 text-gray-700">Task completion updates</span>
              </label>
            </div>

            <div className="pt-4">
              <Button
                onClick={handleNotificationUpdate}
                isLoading={isLoading}
                fullWidth
              >
                Save Notification Preferences
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default Profile;