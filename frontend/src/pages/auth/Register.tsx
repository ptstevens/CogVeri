import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import GoogleSignInButton from '../../components/ui/GoogleSignInButton';
import OAuthPrivacyNotice from '../../components/ui/OAuthPrivacyNotice';
import { toast } from 'react-hot-toast';
import axios from 'axios';
import { Check } from 'lucide-react';
import { tokenService } from '../../services/token.service';

interface OrganizationExistsInfo {
  organizationName: string;
  subscriberEmail: string;
  subscriberName: string;
}

interface PricingTier {
  id: string;
  name: string;
  displayName: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  highlighted: boolean;
}

const Register = () => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    name: '',
    department: '',
    organizationName: '',
  });
  const [selectedTier, setSelectedTier] = useState<string>('free');
  const [pricingTiers, setPricingTiers] = useState<PricingTier[]>([]);
  const [trialDurationDays, setTrialDurationDays] = useState<number>(7);
  const [suggestedOrg, setSuggestedOrg] = useState<string>('');
  const [orgError, setOrgError] = useState<string>('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [organizationExistsError, setOrganizationExistsError] =
    useState<OrganizationExistsInfo | null>(null);
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Check for organization error from URL params (e.g., from Google OAuth redirect)
  useEffect(() => {
    const errorCode = searchParams.get('errorCode');
    if (errorCode === 'ORGANIZATION_EXISTS_MULTI_MEMBER') {
      const orgName = searchParams.get('orgName');
      const subscriberEmail = searchParams.get('subscriberEmail');
      const subscriberName = searchParams.get('subscriberName');

      if (orgName && subscriberEmail) {
        setOrganizationExistsError({
          organizationName: orgName,
          subscriberEmail: subscriberEmail,
          subscriberName: subscriberName || 'the account administrator',
        });
      }

      // Clear the URL params so the error doesn't persist on refresh
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('error');
      newParams.delete('errorCode');
      newParams.delete('orgName');
      newParams.delete('subscriberEmail');
      newParams.delete('subscriberName');
      newParams.delete('message');
      setSearchParams(newParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Fetch pricing tiers and trial info
  useEffect(() => {
    const fetchPricingData = async () => {
      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
        const [tiersResponse, trialResponse] = await Promise.all([
          fetch(`${apiUrl}/pricing/tiers`),
          fetch(`${apiUrl}/pricing/trial-info`),
        ]);

        if (tiersResponse.ok) {
          const tiersData = await tiersResponse.json();
          // Get all tiers except enterprise (custom sales), sort by price
          const tiers = (tiersData.data?.tiers || [])
            .filter((t: PricingTier) => t.name !== 'enterprise')
            .sort((a: PricingTier, b: PricingTier) => a.monthlyPrice - b.monthlyPrice);
          setPricingTiers(tiers);
        }

        if (trialResponse.ok) {
          const trialData = await trialResponse.json();
          if (trialData.trial?.durationDays) {
            setTrialDurationDays(trialData.trial.durationDays);
          }
        }
      } catch (err) {
        console.error('Failed to fetch pricing data:', err);
      }
    };
    fetchPricingData();
  }, []);

  const handleGoogleSignup = () => {
    setIsGoogleLoading(true);
    // Redirect to backend Google OAuth endpoint with signup mode
    // VITE_API_URL already includes /api, so we just append the route
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
    // Pass organization name and selected tier if already entered
    const orgParam = formData.organizationName
      ? `&org=${encodeURIComponent(formData.organizationName)}`
      : '';
    const tierParam = selectedTier !== 'free' ? `&tier=${encodeURIComponent(selectedTier)}` : '';
    window.location.href = `${apiUrl}/auth/google?mode=signup${orgParam}${tierParam}`;
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name) {
      newErrors.name = 'Name is required';
    }

    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(formData.password)) {
      newErrors.password = 'Password must contain uppercase, lowercase, and number';
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    if (!formData.organizationName) {
      setOrgError('Organization name is required');
      setErrors(newErrors);
      return false;
    }

    setOrgError('');
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Extract organization domain from email
  const extractOrgFromEmail = (email: string): string => {
    const domainMatch = email.match(/@([^.]+)\.com$/);
    if (domainMatch) {
      // Convert domain to title case (acme → Acme)
      return domainMatch[1].charAt(0).toUpperCase() + domainMatch[1].slice(1);
    }
    return '';
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    // Clear error for this field when user types
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }

    // Extract organization suggestion from email domain
    if (name === 'email') {
      const suggested = extractOrgFromEmail(value);
      setSuggestedOrg(suggested);
      // Auto-populate organization name if not already set
      if (!formData.organizationName && suggested) {
        setFormData((prev) => ({ ...prev, organizationName: suggested }));
      }
      setOrgError('');
      // Clear organization exists error when email changes
      setOrganizationExistsError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    try {
      const response = await axios.post(`${import.meta.env.VITE_API_URL}/auth/register`, {
        email: formData.email,
        password: formData.password,
        name: formData.name,
        department: formData.department,
        organizationName: formData.organizationName,
        selectedTier,
      });

      // Store access token in memory (refresh token is set via HttpOnly cookie by backend)
      tokenService.setAccessToken(response.data.token);

      // Auto-login after registration
      await login(formData.email, formData.password);
      navigate('/dashboard');
    } catch (error: any) {
      const errorData = error.response?.data?.data;
      const errorMessage =
        error.response?.data?.message || 'Registration failed. Please try again.';

      // Check if this is an organization exists error (multi-member plan blocking signup)
      if (errorData?.errorCode === 'ORGANIZATION_EXISTS_MULTI_MEMBER') {
        setOrganizationExistsError({
          organizationName: errorData.organizationName,
          subscriberEmail: errorData.subscriberEmail,
          subscriberName: errorData.subscriberName,
        });
        // Don't show toast - we'll show a prominent inline message
      } else if (errorData?.organizationExists) {
        // Legacy format - show owner details
        const ownerInfo = `${errorData.ownerName} (${errorData.ownerEmail})`;
        toast.error(`${errorMessage}

Organization Owner: ${ownerInfo}`);
      } else {
        toast.error(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-navy via-brand-navy-dark to-brand-navy flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-primary-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-accent-500/5 rounded-full blur-3xl" />
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="flex justify-center">
          <div className="relative">
            <div className="absolute inset-0 bg-primary-500 rounded-2xl blur-xl opacity-30" />
            <img
              src="/cogveri-icon.png"
              alt="CogVeri"
              className="relative w-20 h-20 object-contain"
            />
          </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-white">
          Create your <span className="text-primary-400">account</span>
        </h2>
        <p className="mt-2 text-center text-sm text-gray-400">
          Join CogVeri - Knowledge, Verified.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <Card className="py-8 px-4 sm:px-10 shadow-2xl border-white/10">
          {/* Google Sign-Up Button with Privacy Notice */}
          <div className="mb-6 space-y-4">
            <GoogleSignInButton
              variant="signup"
              isLoading={isGoogleLoading}
              onClick={handleGoogleSignup}
            />
            <OAuthPrivacyNotice />
          </div>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">Or create account with email</span>
            </div>
          </div>

          {/* Organization Exists Error Banner */}
          {organizationExistsError && (
            <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-amber-400" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="ml-3 flex-1">
                  <h3 className="text-sm font-medium text-amber-800">
                    Organization Already Exists
                  </h3>
                  <div className="mt-2 text-sm text-amber-700">
                    <p>
                      <strong>{organizationExistsError.organizationName}</strong> is already
                      registered on our platform with a team subscription.
                    </p>
                    <p className="mt-2">To join this organization, please contact:</p>
                    <p className="mt-1 font-medium">
                      {organizationExistsError.subscriberName} (
                      {organizationExistsError.subscriberEmail})
                    </p>
                    <p className="mt-2 text-xs text-amber-600">
                      They can invite you to join from their organization settings.
                    </p>
                  </div>
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={() => setOrganizationExistsError(null)}
                      className="text-sm font-medium text-amber-800 hover:text-amber-600"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                Full Name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                required
                value={formData.name}
                onChange={handleChange}
                className={`mt-1 input ${errors.name ? 'border-red-500' : ''}`}
                placeholder="John Doe"
              />
              {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={formData.email}
                onChange={handleChange}
                className={`mt-1 input ${errors.email ? 'border-red-500' : ''}`}
                placeholder="you@company.com"
              />
              {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email}</p>}
              {suggestedOrg && (
                <p className="mt-1 text-xs text-gray-500">
                  Organization auto-detected: <span className="font-medium">{suggestedOrg}</span>
                </p>
              )}
            </div>

            <div>
              <label htmlFor="organizationName" className="block text-sm font-medium text-gray-700">
                Organization Name
              </label>
              <input
                id="organizationName"
                name="organizationName"
                type="text"
                required
                value={formData.organizationName}
                onChange={handleChange}
                className={`mt-1 input ${orgError ? 'border-red-500' : ''}`}
                placeholder="e.g., Acme Corp"
              />
              {orgError && <p className="mt-1 text-sm text-red-600">{orgError}</p>}
              <p className="mt-1 text-xs text-gray-500">
                The primary contact for your organization will be the account owner
              </p>
            </div>

            {/* Plan Selector */}
            {pricingTiers.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Choose your plan
                </label>
                <div className="space-y-2">
                  {pricingTiers.map((tier) => (
                    <button
                      key={tier.id}
                      type="button"
                      onClick={() => setSelectedTier(tier.name)}
                      className={`w-full flex items-center justify-between p-3 rounded-lg border-2 transition-all ${
                        selectedTier === tier.name
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                            selectedTier === tier.name
                              ? 'border-primary-500 bg-primary-500'
                              : 'border-gray-300'
                          }`}
                        >
                          {selectedTier === tier.name && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <div className="text-left">
                          <div className="font-medium text-gray-900">
                            {tier.displayName}
                            {tier.highlighted && (
                              <span className="ml-2 text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full">
                                Popular
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500">
                            {tier.monthlyPrice === 0
                              ? 'Free forever'
                              : `${trialDurationDays}-day free trial, then $${tier.monthlyPrice}/mo`}
                          </div>
                        </div>
                      </div>
                      {tier.monthlyPrice > 0 && (
                        <div className="text-right">
                          <span className="text-xs text-green-600 font-medium">
                            No card required
                          </span>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  {selectedTier === 'free'
                    ? 'Start with basic features, upgrade anytime.'
                    : `Your trial gives you full access to ${pricingTiers.find((t) => t.name === selectedTier)?.displayName || 'this'} plan features.`}
                </p>
              </div>
            )}

            <div>
              <label htmlFor="department" className="block text-sm font-medium text-gray-700">
                Department (Optional)
              </label>
              <select
                id="department"
                name="department"
                value={formData.department}
                onChange={handleChange}
                className="mt-1 input"
              >
                <option value="">Select Department</option>
                <option value="Engineering">Engineering</option>
                <option value="Product">Product</option>
                <option value="Design">Design</option>
                <option value="Marketing">Marketing</option>
                <option value="Sales">Sales</option>
                <option value="Support">Support</option>
                <option value="IT">IT</option>
                <option value="HR">HR</option>
                <option value="Finance">Finance</option>
                <option value="Operations">Operations</option>
              </select>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                value={formData.password}
                onChange={handleChange}
                className={`mt-1 input ${errors.password ? 'border-red-500' : ''}`}
                placeholder="••••••••"
              />
              {errors.password && <p className="mt-1 text-sm text-red-600">{errors.password}</p>}
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                value={formData.confirmPassword}
                onChange={handleChange}
                className={`mt-1 input ${errors.confirmPassword ? 'border-red-500' : ''}`}
                placeholder="••••••••"
              />
              {errors.confirmPassword && (
                <p className="mt-1 text-sm text-red-600">{errors.confirmPassword}</p>
              )}
            </div>

            <div>
              <Button type="submit" fullWidth isLoading={isLoading}>
                Create Account
              </Button>
            </div>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">Already have an account?</span>
              </div>
            </div>

            <div className="mt-6">
              <Link
                to="/login"
                className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
              >
                Sign in to existing account
              </Link>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Register;
