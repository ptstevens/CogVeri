import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Shield,
  Users,
  Globe,
  Lock,
  Clock,
  Headphones,
  Building2,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Zap,
  Database,
  Key,
  FileCheck,
  Network,
} from 'lucide-react';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import { useSubmitEnterpriseContact } from '../../hooks/useBilling';
import { PublicNav } from '../../components/layout/PublicNav';
import { featureFlags } from '../../config/featureFlags';
import { COMING_SOON_BANNER_HEIGHT } from '../../components/ui/ComingSoonBanner';

const COMPANY_SIZES = [
  { value: '', label: 'Select company size' },
  { value: '50-100', label: '50-100 employees' },
  { value: '100-500', label: '100-500 employees' },
  { value: '500-1000', label: '500-1,000 employees' },
  { value: '1000-5000', label: '1,000-5,000 employees' },
  { value: '5000+', label: '5,000+ employees' },
];

const ENTERPRISE_FEATURES = [
  {
    icon: Users,
    title: 'Unlimited Everything',
    description: 'No limits on team members, videos, storage, or tasks. Scale without constraints.',
  },
  {
    icon: Shield,
    title: 'SSO & SAML Integration',
    description:
      'Secure single sign-on with your identity provider. Support for Okta, Azure AD, and more.',
  },
  {
    icon: Key,
    title: 'SCIM Provisioning',
    description: 'Automatic user provisioning and deprovisioning synced with your directory.',
  },
  {
    icon: Globe,
    title: 'Custom Domain',
    description: 'Host CogVeri on your own domain for a seamless brand experience.',
  },
  {
    icon: Headphones,
    title: 'Dedicated CSM',
    description: 'A dedicated Customer Success Manager to ensure your team gets maximum value.',
  },
  {
    icon: Database,
    title: 'Custom Data Retention',
    description: 'Configure data retention policies to meet your compliance requirements.',
  },
  {
    icon: Network,
    title: 'IP Whitelist',
    description: 'Restrict access to specific IP addresses for enhanced security.',
  },
  {
    icon: FileCheck,
    title: 'SLA Guarantees',
    description: '99.9% uptime SLA with enterprise-grade reliability and support.',
  },
];

const FAQS = [
  {
    q: 'What is included in the Enterprise plan?',
    a: 'The Enterprise plan includes everything in our Business plan, plus unlimited team members, unlimited storage, SSO/SAML integration, SCIM provisioning, custom domain, dedicated CSM, custom data retention policies, IP whitelist, and SLA guarantees.',
  },
  {
    q: 'How does pricing work for Enterprise?',
    a: "Enterprise pricing is customized based on your organization's size and needs. We offer annual contracts with flexible payment terms. Contact our sales team for a personalized quote.",
  },
  {
    q: 'Can we do a trial before committing?',
    a: 'Yes! We offer extended trials for enterprise customers. Our team will work with you to set up a proof of concept tailored to your specific use case.',
  },
  {
    q: 'What kind of support is included?',
    a: 'Enterprise customers receive priority support with guaranteed response times, a dedicated Customer Success Manager, quarterly business reviews, and access to our enterprise support hotline.',
  },
  {
    q: 'How long does implementation take?',
    a: 'Most enterprise implementations are completed within 2-4 weeks. This includes SSO setup, SCIM configuration, custom branding, and user training. Your CSM will guide you through every step.',
  },
  {
    q: 'Do you offer security reviews and compliance documentation?',
    a: 'Yes. We provide SOC 2 Type II reports, GDPR compliance documentation, and can accommodate security questionnaires. We also offer custom security reviews for enterprise customers.',
  },
];

const Enterprise = () => {
  const [formData, setFormData] = useState({
    companyName: '',
    name: '',
    email: '',
    phone: '',
    companySize: '',
    message: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  const submitContact = useSubmitEnterpriseContact();

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.companyName.trim()) {
      newErrors.companyName = 'Company name is required';
    }
    if (!formData.name.trim()) {
      newErrors.name = 'Your name is required';
    }
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }
    if (!formData.companySize) {
      newErrors.companySize = 'Please select your company size';
    }
    if (!formData.message.trim()) {
      newErrors.message = 'Please tell us about your use case';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    await submitContact.mutateAsync(formData);

    // Reset form on success
    setFormData({
      companyName: '',
      name: '',
      email: '',
      phone: '',
      companySize: '',
      message: '',
    });
  };

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

  // Calculate content offset based on banner
  const contentPaddingTop = featureFlags.COMING_SOON_MODE ? COMING_SOON_BANNER_HEIGHT + 128 : 128;

  return (
    <div className="min-h-screen bg-white">
      {/* Shared Navigation Component */}
      <PublicNav currentPage="enterprise" />

      {/* Hero Section */}
      <section
        className="pb-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-gray-900 to-gray-800"
        style={{ paddingTop: contentPaddingTop }}
      >
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center px-3 py-1 rounded-full bg-primary-500/20 text-primary-300 text-sm font-medium mb-6">
              <Building2 className="w-4 h-4 mr-2" />
              Enterprise-grade solution
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white tracking-tight">
              Skills verification at
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-primary-400 to-primary-400">
                enterprise scale
              </span>
            </h1>
            <p className="mt-6 text-xl text-gray-300 max-w-2xl mx-auto">
              CogVeri Enterprise gives you unlimited scale, enterprise security, and dedicated
              support for organization-wide training assessment and compliance verification.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href="#contact-form"
                className="w-full sm:w-auto bg-primary-600 text-white px-8 py-4 rounded-xl text-lg font-semibold hover:bg-primary-700 transition shadow-lg hover:shadow-xl flex items-center justify-center"
              >
                Contact Sales
                <ArrowRight className="ml-2 w-5 h-5" />
              </a>
              <Link
                to="/pricing"
                className="w-full sm:w-auto bg-white/10 text-white px-8 py-4 rounded-xl text-lg font-semibold hover:bg-white/20 transition flex items-center justify-center"
              >
                Compare Plans
              </Link>
            </div>
          </div>

          {/* Trust Badges */}
          <div className="mt-16 flex flex-wrap items-center justify-center gap-8 text-gray-400">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              <span className="text-sm">SOC 2 Type II</span>
            </div>
            <div className="flex items-center gap-2">
              <Lock className="w-5 h-5" />
              <span className="text-sm">GDPR Compliant</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              <span className="text-sm">99.9% Uptime SLA</span>
            </div>
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5" />
              <span className="text-sm">Enterprise Support</span>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
              Enterprise-grade features
            </h2>
            <p className="mt-4 text-lg text-gray-600">
              Everything you need to deploy CogVeri at scale across your organization.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {ENTERPRISE_FEATURES.map((feature, i) => (
              <div
                key={i}
                className="relative p-6 bg-white rounded-2xl border border-gray-200 hover:border-gray-300 hover:shadow-lg transition group"
              >
                <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6 text-primary-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-gray-600 text-sm">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="max-w-7xl mx-auto text-center">
          <p className="text-sm text-gray-500 mb-8">Trusted by leading organizations</p>
          <div className="flex flex-wrap justify-center items-center gap-x-12 gap-y-6 opacity-50">
            {['Enterprise Co', 'Global Corp', 'Tech Giants', 'Industry Leader', 'Fortune 500'].map(
              (company, i) => (
                <div key={i} className="text-2xl font-bold text-gray-400">
                  {company}
                </div>
              )
            )}
          </div>
        </div>
      </section>

      {/* Contact Form Section */}
      <section id="contact-form" className="py-24 px-4 sm:px-6 lg:px-8 bg-gray-900">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-start">
            {/* Left Column - Info */}
            <div>
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">
                Let's talk about your needs
              </h2>
              <p className="text-xl text-gray-300 mb-8">
                Our enterprise team will work with you to understand your requirements and create a
                tailored solution for your organization.
              </p>

              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <div className="p-2 rounded-lg bg-primary-500/20">
                    <Clock className="w-5 h-5 text-primary-400" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-white">Quick Response</h4>
                    <p className="text-gray-400 text-sm">
                      Our team responds within 24 hours to discuss your requirements.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="p-2 rounded-lg bg-primary-500/20">
                    <Headphones className="w-5 h-5 text-primary-400" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-white">Dedicated Support</h4>
                    <p className="text-gray-400 text-sm">
                      Get a dedicated CSM and priority support from day one.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="p-2 rounded-lg bg-primary-500/20">
                    <Shield className="w-5 h-5 text-primary-400" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-white">Security Review</h4>
                    <p className="text-gray-400 text-sm">
                      We'll provide all documentation needed for your security review.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column - Form */}
            <div className="bg-white rounded-2xl p-8 shadow-xl">
              <h3 className="text-xl font-semibold text-gray-900 mb-6">Contact our sales team</h3>

              <form onSubmit={handleSubmit} className="space-y-5">
                <Input
                  label="Company Name"
                  value={formData.companyName}
                  onChange={(e) => handleChange('companyName', e.target.value)}
                  error={errors.companyName}
                  placeholder="Acme Corporation"
                  required
                />

                <Input
                  label="Your Name"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  error={errors.name}
                  placeholder="John Smith"
                  required
                />

                <Input
                  label="Work Email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  error={errors.email}
                  placeholder="john@company.com"
                  required
                />

                <Input
                  label="Phone (Optional)"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  placeholder="+1 (555) 123-4567"
                />

                <Select
                  label="Company Size"
                  options={COMPANY_SIZES}
                  value={formData.companySize}
                  onChange={(e) => handleChange('companySize', e.target.value)}
                  error={errors.companySize}
                  required
                />

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    How can we help? <span className="text-error">*</span>
                  </label>
                  <textarea
                    value={formData.message}
                    onChange={(e) => handleChange('message', e.target.value)}
                    placeholder="Tell us about your use case and requirements..."
                    rows={4}
                    className={`w-full px-4 py-2 border rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-0 ${
                      errors.message
                        ? 'border-error focus:ring-error-100 focus:border-error'
                        : 'border-gray-300 focus:ring-primary-100 focus:border-primary-500 hover:border-gray-400'
                    }`}
                  />
                  {errors.message && <p className="mt-1.5 text-sm text-error">{errors.message}</p>}
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  fullWidth
                  size="lg"
                  isLoading={submitContact.isPending}
                >
                  Contact Sales
                </Button>

                <p className="text-xs text-gray-500 text-center">
                  By submitting this form, you agree to our{' '}
                  <Link to="/privacy" className="text-primary-600 hover:underline">
                    Privacy Policy
                  </Link>{' '}
                  and{' '}
                  <Link to="/terms" className="text-primary-600 hover:underline">
                    Terms of Service
                  </Link>
                  .
                </p>
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900">Frequently asked questions</h2>
            <p className="mt-4 text-lg text-gray-600">
              Everything you need to know about CogVeri Enterprise
            </p>
          </div>

          <div className="space-y-4">
            {FAQS.map((faq, i) => (
              <div key={i} className="border border-gray-200 rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
                  className="w-full flex items-center justify-between p-5 text-left bg-white hover:bg-gray-50 transition"
                >
                  <span className="font-semibold text-gray-900">{faq.q}</span>
                  {expandedFaq === i ? (
                    <ChevronUp className="w-5 h-5 text-gray-400 flex-shrink-0 ml-4" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0 ml-4" />
                  )}
                </button>
                {expandedFaq === i && (
                  <div className="px-5 pb-5 bg-white">
                    <p className="text-gray-600">{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-primary-600">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-white mb-4">Ready to get started?</h2>
          <p className="text-lg text-primary-100 mb-8">
            Join hundreds of enterprise teams using CogVeri to power their knowledge workflows.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="#contact-form"
              className="w-full sm:w-auto bg-white text-primary-600 px-8 py-4 rounded-xl text-lg font-semibold hover:bg-primary-50 transition shadow-lg"
            >
              Contact Sales
            </a>
            <Link
              to="/pricing"
              className="w-full sm:w-auto border-2 border-white text-white px-8 py-4 rounded-xl text-lg font-semibold hover:bg-white/10 transition"
            >
              View All Plans
            </Link>
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

export default Enterprise;
