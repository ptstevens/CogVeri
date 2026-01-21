import { Link } from 'react-router-dom';
import { ArrowLeft, Shield, Mail } from 'lucide-react';
import { featureFlags } from '../../config/featureFlags';
import { COMING_SOON_BANNER_HEIGHT } from '../../components/ui/ComingSoonBanner';

const PrivacyPolicy = () => {
  const lastUpdated = 'December 31, 2024';
  const companyName = 'CogVeri';
  const companyEmail = 'privacy@cogveri.com';
  const websiteUrl = 'https://cogveri.com';

  // Calculate offsets based on banner visibility
  const navTop = featureFlags.COMING_SOON_MODE ? COMING_SOON_BANNER_HEIGHT : 0;
  const contentPaddingTop = featureFlags.COMING_SOON_MODE ? COMING_SOON_BANNER_HEIGHT + 96 : 96;

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav
        className="fixed left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100"
        style={{ top: navTop }}
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link to="/" className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition">
              <ArrowLeft className="w-5 h-5" />
              <span className="font-medium">Back to Home</span>
            </Link>
            <div className="flex items-center">
              <img src="/cogveri-logo-horizontal.png" alt="CogVeri" className="h-10 w-auto" />
            </div>
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="pb-16 px-4 sm:px-6 lg:px-8" style={{ paddingTop: contentPaddingTop }}>
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary-100 mb-6">
              <Shield className="w-8 h-8 text-primary-600" />
            </div>
            <h1 className="text-4xl font-bold text-gray-900 mb-4">Privacy Policy</h1>
            <p className="text-gray-600">Last updated: {lastUpdated}</p>
          </div>

          {/* Policy Content */}
          <div className="prose prose-lg max-w-none">
            <section className="mb-10">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">1. Introduction</h2>
              <p className="text-gray-700 leading-relaxed">
                Welcome to {companyName} ("{companyName}", "we", "us", or "our"). We are committed to protecting your privacy
                and ensuring you have a positive experience when using our video demonstration and knowledge sharing platform.
              </p>
              <p className="text-gray-700 leading-relaxed mt-4">
                This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our
                website at {websiteUrl} and our services. Please read this privacy policy carefully. If you do not agree
                with the terms of this privacy policy, please do not access the site or use our services.
              </p>
            </section>

            <section className="mb-10">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">2. Information We Collect</h2>

              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">2.1 Information You Provide Directly</h3>
              <p className="text-gray-700 leading-relaxed">When you register for an account or use our services, we may collect:</p>
              <ul className="list-disc pl-6 mt-3 space-y-2 text-gray-700">
                <li><strong>Account Information:</strong> Name, email address, password, organization name, and department</li>
                <li><strong>Profile Information:</strong> Profile picture, job title, and bio (optional)</li>
                <li><strong>Content:</strong> Video recordings, comments, reviews, and other content you create or upload</li>
                <li><strong>Communications:</strong> Information you provide when contacting our support team</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">2.2 Information from Third-Party Authentication (Google Sign-In)</h3>
              <p className="text-gray-700 leading-relaxed">
                When you choose to sign in or register using Google OAuth, we receive the following information from your Google account:
              </p>
              <ul className="list-disc pl-6 mt-3 space-y-2 text-gray-700">
                <li><strong>Email Address:</strong> Your primary Google account email address</li>
                <li><strong>Name:</strong> Your display name as set in your Google account</li>
                <li><strong>Profile Picture:</strong> Your Google profile picture URL (if available)</li>
                <li><strong>Google User ID:</strong> A unique identifier for your Google account</li>
              </ul>
              <p className="text-gray-700 leading-relaxed mt-4">
                <strong>We do not access:</strong> Your Google contacts, calendar, files, browsing history, or any other
                Google services data. We only request the minimum information necessary for authentication.
              </p>

              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">2.3 Automatically Collected Information</h3>
              <ul className="list-disc pl-6 mt-3 space-y-2 text-gray-700">
                <li><strong>Device Information:</strong> Browser type, operating system, and device type</li>
                <li><strong>Usage Data:</strong> Pages visited, features used, and timestamps</li>
                <li><strong>Log Data:</strong> IP address, access times, and referring URLs</li>
              </ul>
            </section>

            <section className="mb-10">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">3. How We Use Your Information</h2>
              <p className="text-gray-700 leading-relaxed">We use the information we collect to:</p>
              <ul className="list-disc pl-6 mt-3 space-y-2 text-gray-700">
                <li><strong>Provide Our Services:</strong> Create and manage your account, authenticate your identity, and enable you to use {companyName} features</li>
                <li><strong>Process Transactions:</strong> Handle subscriptions and billing for paid features</li>
                <li><strong>Communicate With You:</strong> Send service-related notifications, updates, and support responses</li>
                <li><strong>Improve Our Services:</strong> Analyze usage patterns to enhance user experience and develop new features</li>
                <li><strong>Ensure Security:</strong> Protect against unauthorized access, fraud, and abuse</li>
                <li><strong>Comply With Legal Obligations:</strong> Meet applicable legal requirements and respond to lawful requests</li>
              </ul>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-6">
                <h4 className="font-semibold text-blue-900 mb-2">Google User Data Specific Use</h4>
                <p className="text-blue-800 text-sm">
                  Information received from Google APIs is used solely for authentication and account creation purposes.
                  We do not use Google user data for advertising, marketing, or any purpose other than providing and
                  improving the {companyName} service as described in this policy.
                </p>
              </div>
            </section>

            <section className="mb-10">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">4. How We Share Your Information</h2>
              <p className="text-gray-700 leading-relaxed">We may share your information in the following circumstances:</p>
              <ul className="list-disc pl-6 mt-3 space-y-2 text-gray-700">
                <li><strong>Within Your Organization:</strong> Team members in your organization can see your profile, recordings, and contributions based on your organization's settings</li>
                <li><strong>Service Providers:</strong> We work with trusted third-party service providers who assist us in operating our platform (e.g., cloud hosting, email delivery)</li>
                <li><strong>Legal Requirements:</strong> When required by law, court order, or governmental authority</li>
                <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets</li>
              </ul>

              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mt-6">
                <h4 className="font-semibold text-red-900 mb-2">We Never:</h4>
                <ul className="text-red-800 text-sm space-y-1">
                  <li>Sell your personal information or Google user data to third parties</li>
                  <li>Share your data with advertising platforms, data brokers, or information resellers</li>
                  <li>Use your data for targeted advertising, retargeting, or interest-based advertising</li>
                  <li>Use your data for credit scoring, lending decisions, or surveillance purposes</li>
                </ul>
              </div>
            </section>

            <section className="mb-10">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">5. Data Storage and Security</h2>
              <p className="text-gray-700 leading-relaxed">
                We implement industry-standard security measures to protect your information:
              </p>
              <ul className="list-disc pl-6 mt-3 space-y-2 text-gray-700">
                <li><strong>Encryption:</strong> All data is encrypted in transit using TLS 1.2+ and at rest using AES-256</li>
                <li><strong>Access Controls:</strong> Strict access controls limit who can access your data within our organization</li>
                <li><strong>Secure Infrastructure:</strong> We use reputable cloud providers with SOC 2 compliance</li>
                <li><strong>Regular Audits:</strong> We conduct regular security assessments and vulnerability testing</li>
              </ul>
              <p className="text-gray-700 leading-relaxed mt-4">
                Your data is stored on servers located in secure data centers. While we strive to use commercially
                acceptable means to protect your personal information, no method of transmission over the Internet
                or method of electronic storage is 100% secure.
              </p>
            </section>

            <section className="mb-10">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">6. Data Retention</h2>
              <p className="text-gray-700 leading-relaxed">
                We retain your information for as long as your account is active or as needed to provide you services.
                Specifically:
              </p>
              <ul className="list-disc pl-6 mt-3 space-y-2 text-gray-700">
                <li><strong>Account Data:</strong> Retained until you delete your account</li>
                <li><strong>Video Recordings:</strong> Retained according to your organization's retention policy settings</li>
                <li><strong>Usage Logs:</strong> Retained for up to 12 months for security and analytics purposes</li>
                <li><strong>Backup Data:</strong> Retained for up to 30 days after deletion for disaster recovery</li>
              </ul>
              <p className="text-gray-700 leading-relaxed mt-4">
                When you request account deletion, we will delete or anonymize your personal information within 30 days,
                except where we are required to retain it for legal, regulatory, or legitimate business purposes.
              </p>
            </section>

            <section className="mb-10">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">7. Your Rights and Choices</h2>
              <p className="text-gray-700 leading-relaxed">You have the following rights regarding your personal information:</p>
              <ul className="list-disc pl-6 mt-3 space-y-2 text-gray-700">
                <li><strong>Access:</strong> Request a copy of the personal information we hold about you</li>
                <li><strong>Correction:</strong> Update or correct inaccurate information in your profile settings</li>
                <li><strong>Deletion:</strong> Request deletion of your account and associated data</li>
                <li><strong>Portability:</strong> Request an export of your data in a machine-readable format</li>
                <li><strong>Withdrawal of Consent:</strong> Revoke Google OAuth access through your Google Account settings</li>
              </ul>
              <p className="text-gray-700 leading-relaxed mt-4">
                To exercise these rights, please contact us at <a href={`mailto:${companyEmail}`} className="text-primary-600 hover:underline">{companyEmail}</a> or
                use the account settings in your {companyName} dashboard.
              </p>

              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mt-6">
                <h4 className="font-semibold text-gray-900 mb-2">Revoking Google Access</h4>
                <p className="text-gray-700 text-sm">
                  You can revoke {companyName}'s access to your Google account at any time by visiting{' '}
                  <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">
                    Google Account Permissions
                  </a>. Note that revoking access will prevent you from signing in with Google, but your {companyName} account will remain active.
                </p>
              </div>
            </section>

            <section className="mb-10">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">8. Cookies and Tracking Technologies</h2>
              <p className="text-gray-700 leading-relaxed">
                We use essential cookies to enable core functionality such as authentication and security.
                We may also use analytics cookies to understand how users interact with our service.
              </p>
              <ul className="list-disc pl-6 mt-3 space-y-2 text-gray-700">
                <li><strong>Essential Cookies:</strong> Required for authentication and basic functionality</li>
                <li><strong>Analytics Cookies:</strong> Help us understand usage patterns (can be disabled)</li>
              </ul>
              <p className="text-gray-700 leading-relaxed mt-4">
                You can control cookie preferences through your browser settings.
              </p>
            </section>

            <section className="mb-10">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">9. International Data Transfers</h2>
              <p className="text-gray-700 leading-relaxed">
                Your information may be transferred to and processed in countries other than your country of residence.
                These countries may have different data protection laws. When we transfer your information, we ensure
                appropriate safeguards are in place to protect your data in accordance with this privacy policy.
              </p>
            </section>

            <section className="mb-10">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">10. Children's Privacy</h2>
              <p className="text-gray-700 leading-relaxed">
                {companyName} is not intended for users under the age of 16. We do not knowingly collect personal
                information from children under 16. If you become aware that a child has provided us with personal
                information, please contact us at <a href={`mailto:${companyEmail}`} className="text-primary-600 hover:underline">{companyEmail}</a>.
              </p>
            </section>

            <section className="mb-10">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">11. Changes to This Privacy Policy</h2>
              <p className="text-gray-700 leading-relaxed">
                We may update this Privacy Policy from time to time. We will notify you of any material changes by
                posting the new Privacy Policy on this page and updating the "Last updated" date. If we make significant
                changes to how we use your Google user data, we will notify you and request your consent before
                implementing those changes.
              </p>
              <p className="text-gray-700 leading-relaxed mt-4">
                We encourage you to review this Privacy Policy periodically for any changes.
              </p>
            </section>

            <section className="mb-10">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">12. Contact Us</h2>
              <p className="text-gray-700 leading-relaxed">
                If you have questions or concerns about this Privacy Policy or our data practices, please contact us:
              </p>
              <div className="bg-gray-50 rounded-lg p-6 mt-4">
                <p className="text-gray-700 font-medium">{companyName}</p>
                <div className="flex items-center gap-2 mt-2 text-gray-600">
                  <Mail className="w-4 h-4" />
                  <a href={`mailto:${companyEmail}`} className="text-primary-600 hover:underline">{companyEmail}</a>
                </div>
                <p className="text-gray-600 mt-2">Website: <a href={websiteUrl} className="text-primary-600 hover:underline">{websiteUrl}</a></p>
              </div>
            </section>

            <section className="mb-10">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">13. Google API Services Disclosure</h2>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-yellow-900 text-sm">
                  {companyName}'s use and transfer to any other app of information received from Google APIs will adhere to{' '}
                  <a
                    href="https://developers.google.com/terms/api-services-user-data-policy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-yellow-700 underline hover:text-yellow-900"
                  >
                    Google API Services User Data Policy
                  </a>, including the Limited Use requirements.
                </p>
              </div>
            </section>
          </div>

          {/* Footer Links */}
          <div className="mt-12 pt-8 border-t border-gray-200 flex flex-wrap justify-center gap-6 text-sm text-gray-600">
            <Link to="/" className="hover:text-gray-900 transition">Home</Link>
            <Link to="/terms" className="hover:text-gray-900 transition">Terms of Service</Link>
            <Link to="/login" className="hover:text-gray-900 transition">Sign In</Link>
            <Link to="/register" className="hover:text-gray-900 transition">Get Started</Link>
          </div>
        </div>
      </main>
    </div>
  );
};

export default PrivacyPolicy;
