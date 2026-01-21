import { Link } from 'react-router-dom';
import { ArrowLeft, FileText, Mail } from 'lucide-react';
import { featureFlags } from '../../config/featureFlags';
import { COMING_SOON_BANNER_HEIGHT } from '../../components/ui/ComingSoonBanner';

const TermsOfService = () => {
  const lastUpdated = 'December 31, 2024';
  const companyName = 'CogVeri';
  const companyEmail = 'legal@cogveri.com';
  const supportEmail = 'support@cogveri.com';
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
              <FileText className="w-8 h-8 text-primary-600" />
            </div>
            <h1 className="text-4xl font-bold text-gray-900 mb-4">Terms of Service</h1>
            <p className="text-gray-600">Last updated: {lastUpdated}</p>
          </div>

          {/* Terms Content */}
          <div className="prose prose-lg max-w-none">
            <section className="mb-10">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">1. Agreement to Terms</h2>
              <p className="text-gray-700 leading-relaxed">
                By accessing or using {companyName} ("Service"), you agree to be bound by these Terms of Service ("Terms").
                If you disagree with any part of the terms, you may not access the Service.
              </p>
              <p className="text-gray-700 leading-relaxed mt-4">
                These Terms apply to all visitors, users, and others who access or use the Service. By using the Service,
                you represent that you are at least 16 years of age and have the legal capacity to enter into these Terms.
              </p>
            </section>

            <section className="mb-10">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">2. Description of Service</h2>
              <p className="text-gray-700 leading-relaxed">
                {companyName} is a video demonstration and knowledge sharing platform that enables teams to:
              </p>
              <ul className="list-disc pl-6 mt-3 space-y-2 text-gray-700">
                <li>Create and share professional video recordings</li>
                <li>Manage structured task workflows for knowledge demonstration</li>
                <li>Provide and receive expert feedback on recorded content</li>
                <li>Collaborate within organizations on knowledge transfer</li>
              </ul>
            </section>

            <section className="mb-10">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">3. Account Registration</h2>
              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">3.1 Account Creation</h3>
              <p className="text-gray-700 leading-relaxed">
                To use certain features of the Service, you must register for an account. You may register using:
              </p>
              <ul className="list-disc pl-6 mt-3 space-y-2 text-gray-700">
                <li>Email and password</li>
                <li>Google Sign-In (OAuth authentication)</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">3.2 Account Responsibilities</h3>
              <p className="text-gray-700 leading-relaxed">You agree to:</p>
              <ul className="list-disc pl-6 mt-3 space-y-2 text-gray-700">
                <li>Provide accurate, current, and complete information during registration</li>
                <li>Maintain the security of your password and account</li>
                <li>Promptly notify us of any unauthorized access or security breach</li>
                <li>Accept responsibility for all activities that occur under your account</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">3.3 Organization Accounts</h3>
              <p className="text-gray-700 leading-relaxed">
                If you create or join an organization on {companyName}, you represent that you have the authority to
                bind that organization to these Terms. Organization owners and administrators are responsible for
                managing member access and ensuring compliance with these Terms.
              </p>
            </section>

            <section className="mb-10">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">4. Acceptable Use</h2>
              <p className="text-gray-700 leading-relaxed">You agree not to use the Service to:</p>
              <ul className="list-disc pl-6 mt-3 space-y-2 text-gray-700">
                <li>Violate any applicable laws, regulations, or third-party rights</li>
                <li>Upload or share content that is illegal, harmful, threatening, abusive, harassing, defamatory, or otherwise objectionable</li>
                <li>Impersonate any person or entity or misrepresent your affiliation</li>
                <li>Upload viruses, malware, or other harmful code</li>
                <li>Attempt to gain unauthorized access to any part of the Service</li>
                <li>Interfere with or disrupt the Service or servers</li>
                <li>Scrape, data mine, or collect user information without consent</li>
                <li>Use the Service for any commercial purpose not expressly permitted</li>
                <li>Record or share content that infringes intellectual property rights</li>
                <li>Share confidential or proprietary information without authorization</li>
              </ul>
            </section>

            <section className="mb-10">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">5. User Content</h2>
              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">5.1 Ownership</h3>
              <p className="text-gray-700 leading-relaxed">
                You retain ownership of all content you create and upload to the Service ("User Content").
                By uploading User Content, you grant {companyName} a non-exclusive, worldwide, royalty-free license
                to use, store, display, and distribute your User Content solely for the purpose of providing
                and improving the Service.
              </p>

              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">5.2 Content Responsibility</h3>
              <p className="text-gray-700 leading-relaxed">
                You are solely responsible for your User Content and the consequences of posting it.
                You represent and warrant that:
              </p>
              <ul className="list-disc pl-6 mt-3 space-y-2 text-gray-700">
                <li>You own or have the necessary rights to use and authorize the use of your User Content</li>
                <li>Your User Content does not infringe any third party's intellectual property rights</li>
                <li>Your User Content does not contain confidential information of third parties</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">5.3 Content Moderation</h3>
              <p className="text-gray-700 leading-relaxed">
                We reserve the right, but are not obligated, to review, monitor, edit, or remove User Content
                that violates these Terms or that we find objectionable. We may also suspend or terminate
                accounts that violate these Terms.
              </p>
            </section>

            <section className="mb-10">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">6. Subscription and Payment</h2>
              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">6.1 Free and Paid Plans</h3>
              <p className="text-gray-700 leading-relaxed">
                {companyName} offers both free and paid subscription plans. Free plans have limitations on
                features, storage, and team size. Paid plans provide additional features and capacity.
              </p>

              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">6.2 Billing</h3>
              <p className="text-gray-700 leading-relaxed">
                If you purchase a paid subscription, you agree to pay all applicable fees. Subscriptions
                automatically renew unless cancelled before the renewal date. Prices may change with
                30 days' notice.
              </p>

              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">6.3 Refunds</h3>
              <p className="text-gray-700 leading-relaxed">
                Refunds are provided in accordance with our refund policy. Generally, we do not provide
                refunds for partial subscription periods, but may make exceptions at our discretion.
              </p>
            </section>

            <section className="mb-10">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">7. Intellectual Property</h2>
              <p className="text-gray-700 leading-relaxed">
                The Service, including its original content, features, and functionality, is owned by
                {companyName} and is protected by international copyright, trademark, patent, trade secret,
                and other intellectual property laws.
              </p>
              <p className="text-gray-700 leading-relaxed mt-4">
                Our trademarks and trade dress may not be used in connection with any product or service
                without our prior written consent.
              </p>
            </section>

            <section className="mb-10">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">8. Third-Party Services</h2>
              <p className="text-gray-700 leading-relaxed">
                The Service may integrate with or contain links to third-party services, including:
              </p>
              <ul className="list-disc pl-6 mt-3 space-y-2 text-gray-700">
                <li><strong>Google Sign-In:</strong> For authentication purposes, subject to Google's Terms of Service</li>
                <li><strong>Cloud Storage Providers:</strong> For storing your video recordings</li>
                <li><strong>Payment Processors:</strong> For handling subscription payments</li>
              </ul>
              <p className="text-gray-700 leading-relaxed mt-4">
                We are not responsible for the content, privacy policies, or practices of third-party services.
                Your use of such services is at your own risk.
              </p>
            </section>

            <section className="mb-10">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">9. Privacy</h2>
              <p className="text-gray-700 leading-relaxed">
                Your use of the Service is also governed by our{' '}
                <Link to="/privacy" className="text-primary-600 hover:underline">Privacy Policy</Link>,
                which is incorporated into these Terms by reference. Please review our Privacy Policy
                to understand how we collect, use, and protect your information.
              </p>
            </section>

            <section className="mb-10">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">10. Disclaimer of Warranties</h2>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <p className="text-gray-700 text-sm uppercase font-semibold mb-2">Important Notice</p>
                <p className="text-gray-700">
                  THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED.
                  TO THE FULLEST EXTENT PERMITTED BY LAW, WE DISCLAIM ALL WARRANTIES, INCLUDING IMPLIED WARRANTIES OF
                  MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
                </p>
                <p className="text-gray-700 mt-3">
                  WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, SECURE, OR ERROR-FREE, THAT DEFECTS WILL BE
                  CORRECTED, OR THAT THE SERVICE IS FREE OF VIRUSES OR OTHER HARMFUL COMPONENTS.
                </p>
              </div>
            </section>

            <section className="mb-10">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">11. Limitation of Liability</h2>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <p className="text-gray-700">
                  TO THE MAXIMUM EXTENT PERMITTED BY LAW, {companyName.toUpperCase()} SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL,
                  SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING WITHOUT LIMITATION, LOSS OF PROFITS, DATA, USE,
                  GOODWILL, OR OTHER INTANGIBLE LOSSES, RESULTING FROM:
                </p>
                <ul className="list-disc pl-6 mt-3 space-y-1 text-gray-700">
                  <li>Your access to or use of or inability to access or use the Service</li>
                  <li>Any conduct or content of any third party on the Service</li>
                  <li>Any content obtained from the Service</li>
                  <li>Unauthorized access, use, or alteration of your transmissions or content</li>
                </ul>
                <p className="text-gray-700 mt-3">
                  IN NO EVENT SHALL OUR TOTAL LIABILITY TO YOU EXCEED THE AMOUNT YOU PAID US, IF ANY, IN THE PAST
                  TWELVE (12) MONTHS FOR THE SERVICE.
                </p>
              </div>
            </section>

            <section className="mb-10">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">12. Indemnification</h2>
              <p className="text-gray-700 leading-relaxed">
                You agree to defend, indemnify, and hold harmless {companyName}, its officers, directors, employees,
                and agents, from and against any claims, liabilities, damages, losses, and expenses, including
                reasonable attorney's fees, arising out of or in any way connected with:
              </p>
              <ul className="list-disc pl-6 mt-3 space-y-2 text-gray-700">
                <li>Your access to or use of the Service</li>
                <li>Your violation of these Terms</li>
                <li>Your violation of any third-party rights, including intellectual property rights</li>
                <li>Your User Content</li>
              </ul>
            </section>

            <section className="mb-10">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">13. Termination</h2>
              <p className="text-gray-700 leading-relaxed">
                We may terminate or suspend your account and access to the Service immediately, without prior
                notice or liability, for any reason, including if you breach these Terms.
              </p>
              <p className="text-gray-700 leading-relaxed mt-4">
                Upon termination, your right to use the Service will immediately cease. If you wish to terminate
                your account, you may do so through your account settings or by contacting us.
              </p>
              <p className="text-gray-700 leading-relaxed mt-4">
                All provisions of these Terms which by their nature should survive termination shall survive,
                including ownership provisions, warranty disclaimers, indemnity, and limitations of liability.
              </p>
            </section>

            <section className="mb-10">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">14. Changes to Terms</h2>
              <p className="text-gray-700 leading-relaxed">
                We reserve the right to modify these Terms at any time. We will provide notice of significant
                changes by posting the new Terms on this page and updating the "Last updated" date.
              </p>
              <p className="text-gray-700 leading-relaxed mt-4">
                Your continued use of the Service after any changes constitutes acceptance of the new Terms.
                If you do not agree to the new Terms, please stop using the Service.
              </p>
            </section>

            <section className="mb-10">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">15. Governing Law</h2>
              <p className="text-gray-700 leading-relaxed">
                These Terms shall be governed by and construed in accordance with the laws of the jurisdiction
                in which {companyName} operates, without regard to its conflict of law provisions.
              </p>
            </section>

            <section className="mb-10">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">16. Dispute Resolution</h2>
              <p className="text-gray-700 leading-relaxed">
                Any disputes arising out of or relating to these Terms or the Service shall first be attempted
                to be resolved through good-faith negotiation. If negotiation fails, disputes shall be resolved
                through binding arbitration in accordance with applicable arbitration rules.
              </p>
            </section>

            <section className="mb-10">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">17. Severability</h2>
              <p className="text-gray-700 leading-relaxed">
                If any provision of these Terms is held to be invalid or unenforceable, that provision will
                be enforced to the maximum extent permissible, and the other provisions will remain in full
                force and effect.
              </p>
            </section>

            <section className="mb-10">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">18. Contact Us</h2>
              <p className="text-gray-700 leading-relaxed">
                If you have any questions about these Terms, please contact us:
              </p>
              <div className="bg-gray-50 rounded-lg p-6 mt-4">
                <p className="text-gray-700 font-medium">{companyName}</p>
                <div className="flex items-center gap-2 mt-2 text-gray-600">
                  <Mail className="w-4 h-4" />
                  <span>Legal: <a href={`mailto:${companyEmail}`} className="text-primary-600 hover:underline">{companyEmail}</a></span>
                </div>
                <div className="flex items-center gap-2 mt-1 text-gray-600">
                  <Mail className="w-4 h-4" />
                  <span>Support: <a href={`mailto:${supportEmail}`} className="text-primary-600 hover:underline">{supportEmail}</a></span>
                </div>
                <p className="text-gray-600 mt-2">Website: <a href={websiteUrl} className="text-primary-600 hover:underline">{websiteUrl}</a></p>
              </div>
            </section>
          </div>

          {/* Footer Links */}
          <div className="mt-12 pt-8 border-t border-gray-200 flex flex-wrap justify-center gap-6 text-sm text-gray-600">
            <Link to="/" className="hover:text-gray-900 transition">Home</Link>
            <Link to="/privacy" className="hover:text-gray-900 transition">Privacy Policy</Link>
            <Link to="/login" className="hover:text-gray-900 transition">Sign In</Link>
            <Link to="/register" className="hover:text-gray-900 transition">Get Started</Link>
          </div>
        </div>
      </main>
    </div>
  );
};

export default TermsOfService;
