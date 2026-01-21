import { Link } from 'react-router-dom';
import {
  Video,
  CheckCircle,
  Users,
  Shield,
  Zap,
  ArrowRight,
  Play,
  Star,
  BarChart3,
  MessageSquare,
  FileVideo,
  Sparkles,
  Bell,
} from 'lucide-react';
import { featureFlags } from '../../config/featureFlags';
import { COMING_SOON_BANNER_HEIGHT } from '../../components/ui/ComingSoonBanner';
import { PublicNav } from '../../components/layout/PublicNav';

const LandingPage = () => {
  return (
    <div className="min-h-screen bg-brand-navy">
      {/* Animated Background Gradient - Brand Colors */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-br from-primary-600/20 via-transparent to-transparent rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-to-tl from-accent-500/15 via-transparent to-transparent rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-gradient-to-br from-primary-400/10 to-transparent rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      {/* Shared Navigation Component */}
      <PublicNav currentPage="home" logoSize="large" />

      {/* Hero Section */}
      {/* Extra padding when Coming Soon banner is visible (banner height + nav height + spacing) */}
      <section
        className="relative pb-20 px-4 sm:px-6 lg:px-8 min-h-screen flex items-center"
        style={{ paddingTop: featureFlags.COMING_SOON_MODE ? COMING_SOON_BANNER_HEIGHT + 128 : 128 }}
      >
        <div className="max-w-7xl mx-auto w-full">
          <div className="text-center max-w-5xl mx-auto">
            {/* Announcement Badge */}
            <div className="inline-flex items-center px-4 py-2 rounded-full bg-primary-500/10 border border-primary-500/20 text-primary-300 text-sm font-medium mb-8 backdrop-blur-sm">
              <Sparkles className="w-4 h-4 mr-2 text-primary-400" />
              Magic links included on all plans — unlimited submissions
            </div>

            {/* Main Headline */}
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight">
              <span className="text-white">Video-based</span>
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-400 via-primary-300 to-accent-400 animate-gradient">
                skills verification
              </span>
            </h1>

            {/* Subheadline */}
            <p className="mt-8 text-xl sm:text-2xl text-gray-400 max-w-3xl mx-auto leading-relaxed">
              Send a magic link. They record. You verify.
              <span className="text-white font-medium"> No accounts needed for submissions.</span>
            </p>

            {/* CTA Buttons */}
            <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4">
              {featureFlags.COMING_SOON_MODE ? (
                <span className="w-full sm:w-auto bg-gray-500 text-white px-8 py-4 rounded-xl text-lg font-semibold cursor-not-allowed flex items-center justify-center">
                  <Bell className="mr-2 w-5 h-5" />
                  Coming Soon
                </span>
              ) : (
                <Link
                  to="/register"
                  className="group w-full sm:w-auto bg-accent-500 hover:bg-accent-600 text-white px-8 py-4 rounded-xl text-lg font-semibold transition shadow-2xl shadow-accent-500/25 hover:shadow-accent-500/40 flex items-center justify-center"
                >
                  Start Free Trial
                  <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Link>
              )}
              <a
                href="#demo"
                className="w-full sm:w-auto text-white px-8 py-4 rounded-xl text-lg font-semibold border border-white/20 hover:bg-white/5 transition flex items-center justify-center backdrop-blur-sm"
              >
                <Play className="mr-2 w-5 h-5" />
                Watch Demo
              </a>
            </div>

            {/* Trust Indicators */}
            <div className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 text-gray-500 text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-primary-500" />
                <span>No credit card required</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-primary-500" />
                <span>Free forever for 1 seat</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-primary-500" />
                <span>Setup in 2 minutes</span>
              </div>
            </div>
          </div>

          {/* Hero Image/Screenshot */}
          <div className="mt-20 relative">
            {/* Glow Effect Behind Screenshot */}
            <div className="absolute inset-0 bg-gradient-to-r from-primary-500/20 via-primary-400/20 to-accent-500/20 rounded-3xl blur-3xl scale-95" />

            <div className="relative bg-brand-navy-dark rounded-2xl shadow-2xl overflow-hidden border border-white/10">
              <div className="flex items-center gap-2 px-4 py-3 bg-brand-navy/50 border-b border-white/5">
                <div className="w-3 h-3 rounded-full bg-red-500/80" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                <div className="w-3 h-3 rounded-full bg-green-500/80" />
                <span className="ml-2 text-gray-500 text-sm">cogveri.com</span>
              </div>
              <img
                src="/screenshots/dashboard.png"
                alt="CogVeri Dashboard - Skills verification overview"
                className="w-full"
              />
            </div>

            {/* Fade to next section */}
            <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-brand-navy to-transparent pointer-events-none" />
          </div>
        </div>
      </section>

      {/* Social Proof / Use Cases */}
      <section className="py-16 bg-brand-navy border-y border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm text-gray-500 mb-10 uppercase tracking-wider">Trusted for skills verification by</p>
          <div className="flex flex-wrap justify-center items-center gap-x-16 gap-y-8">
            {[
              { name: 'Training Teams', icon: '🎯' },
              { name: 'HR & Recruiting', icon: '👥' },
              { name: 'Compliance', icon: '🛡️' },
              { name: 'Education', icon: '📚' },
              { name: 'Onboarding', icon: '🚀' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-gray-400 hover:text-white transition">
                <span className="text-2xl">{item.icon}</span>
                <span className="text-lg font-medium">{item.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Product Showcase Section */}
      <section id="demo" className="py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-brand-navy to-brand-navy-dark">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <p className="text-primary-400 font-semibold mb-4 uppercase tracking-wider text-sm">See it in action</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white">
              A complete <span className="text-primary-400">skills verification</span> workflow
            </h2>
            <p className="mt-4 text-lg text-gray-400">
              From task creation to final review, CogVeri gives you everything you need to verify competency.
            </p>
          </div>

          {/* Screenshot Grid */}
          <div className="grid md:grid-cols-2 gap-8">
            {/* Tasks Screenshot */}
            <div className="group">
              <div className="relative bg-brand-navy rounded-xl shadow-2xl overflow-hidden border border-white/10 transition-all hover:border-primary-500/30 hover:shadow-primary-500/10">
                <div className="flex items-center gap-2 px-4 py-3 bg-brand-navy/80 border-b border-white/5">
                  <div className="w-3 h-3 rounded-full bg-red-500/80" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                  <div className="w-3 h-3 rounded-full bg-green-500/80" />
                </div>
                <img
                  src="/screenshots/tasks-list.png"
                  alt="CogVeri Tasks - Manage and track assessment tasks"
                  className="w-full"
                />
              </div>
              <div className="mt-4 text-center">
                <h3 className="text-lg font-semibold text-white">Task Management</h3>
                <p className="text-gray-400 text-sm">Create, assign, and track assessment tasks with deadlines</p>
              </div>
            </div>

            {/* Reviews Screenshot */}
            <div className="group">
              <div className="relative bg-brand-navy rounded-xl shadow-2xl overflow-hidden border border-white/10 transition-all hover:border-primary-500/30 hover:shadow-primary-500/10">
                <div className="flex items-center gap-2 px-4 py-3 bg-brand-navy/80 border-b border-white/5">
                  <div className="w-3 h-3 rounded-full bg-red-500/80" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                  <div className="w-3 h-3 rounded-full bg-green-500/80" />
                </div>
                <img
                  src="/screenshots/reviews-queue.png"
                  alt="CogVeri Review Queue - Evaluate video submissions"
                  className="w-full"
                />
              </div>
              <div className="mt-4 text-center">
                <h3 className="text-lg font-semibold text-white">Review Queue</h3>
                <p className="text-gray-400 text-sm">Evaluate submissions, approve or request re-takes</p>
              </div>
            </div>

            {/* Dashboard Screenshot */}
            <div className="group">
              <div className="relative bg-brand-navy rounded-xl shadow-2xl overflow-hidden border border-white/10 transition-all hover:border-primary-500/30 hover:shadow-primary-500/10">
                <div className="flex items-center gap-2 px-4 py-3 bg-brand-navy/80 border-b border-white/5">
                  <div className="w-3 h-3 rounded-full bg-red-500/80" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                  <div className="w-3 h-3 rounded-full bg-green-500/80" />
                </div>
                <img
                  src="/screenshots/dashboard.png"
                  alt="CogVeri Dashboard - Overview of your verification tasks"
                  className="w-full"
                />
              </div>
              <div className="mt-4 text-center">
                <h3 className="text-lg font-semibold text-white">Dashboard</h3>
                <p className="text-gray-400 text-sm">Get an overview of activity and task status at a glance</p>
              </div>
            </div>

            {/* Settings Screenshot */}
            <div className="group">
              <div className="relative bg-brand-navy rounded-xl shadow-2xl overflow-hidden border border-white/10 transition-all hover:border-primary-500/30 hover:shadow-primary-500/10">
                <div className="flex items-center gap-2 px-4 py-3 bg-brand-navy/80 border-b border-white/5">
                  <div className="w-3 h-3 rounded-full bg-red-500/80" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                  <div className="w-3 h-3 rounded-full bg-green-500/80" />
                </div>
                <img
                  src="/screenshots/settings.png"
                  alt="CogVeri Settings - Configure your organization"
                  className="w-full"
                />
              </div>
              <div className="mt-4 text-center">
                <h3 className="text-lg font-semibold text-white">Organization Settings</h3>
                <p className="text-gray-400 text-sm">Manage teams, templates, and preferences</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 px-4 sm:px-6 lg:px-8 bg-brand-navy">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white">
              Everything you need for <span className="text-primary-400">skills verification</span>
            </h2>
            <p className="mt-4 text-lg text-gray-400">
              From task assignment to competency assessment, CogVeri provides a complete workflow for video-based evaluation.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: Zap,
                title: 'Magic Links',
                description: 'Send a link, get a video. Recipients click, record, and submit—no account creation, no passwords, no friction.',
                gradient: 'from-primary-500 to-primary-400',
                highlight: true,
              },
              {
                icon: Video,
                title: 'Browser Recording',
                description: 'Record screen, camera, or both directly in the browser. No software to install or configure.',
                gradient: 'from-primary-600 to-primary-500',
              },
              {
                icon: FileVideo,
                title: 'Assessment Tasks',
                description: 'Create structured tasks with clear instructions, criteria, and deadlines. Track completion status.',
                gradient: 'from-primary-500 to-accent-500',
              },
              {
                icon: MessageSquare,
                title: 'Review & Evaluate',
                description: 'Watch submissions, add timestamped feedback, and approve or request re-demonstrations.',
                gradient: 'from-accent-500 to-accent-400',
              },
              {
                icon: BarChart3,
                title: 'Auto-Transcription',
                description: 'AI-powered transcription captures verbal explanations. Search and review what was said.',
                gradient: 'from-primary-400 to-primary-300',
              },
              {
                icon: Shield,
                title: 'Enterprise Ready',
                description: 'SSO integration, role-based access, and audit logs for compliance and regulatory needs.',
                gradient: 'from-brand-navy-light to-primary-600',
              },
            ].map((feature, i) => (
              <div
                key={i}
                className={`relative p-6 rounded-2xl border transition group ${
                  feature.highlight
                    ? 'bg-gradient-to-br from-primary-500/10 to-accent-500/10 border-primary-500/30 hover:border-primary-500/50'
                    : 'bg-white/5 border-white/10 hover:border-white/20 hover:bg-white/10'
                }`}
              >
                <div className={`w-12 h-12 bg-gradient-to-br ${feature.gradient} rounded-xl flex items-center justify-center mb-4 shadow-lg`}>
                  <feature.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
                <p className="text-gray-400">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-24 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <p className="text-primary-600 font-semibold mb-4 uppercase tracking-wider text-sm">How it works</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
              One link. One click. <span className="text-primary-600">Verified.</span>
            </h2>
            <p className="mt-4 text-lg text-gray-600">
              No accounts to create. No software to install. Just send a magic link and get proof of competency.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <div className="bg-white rounded-2xl p-8 border border-gray-200 shadow-sm hover:shadow-xl hover:border-primary-200 transition">
              <div className="flex items-center gap-4 mb-5">
                <div className="w-10 h-10 bg-primary-600 rounded-full flex items-center justify-center text-white font-bold text-lg">1</div>
                <div className="w-12 h-12 bg-gradient-to-br from-primary-500 to-primary-600 rounded-xl flex items-center justify-center shadow-lg shadow-primary-500/25">
                  <Zap className="w-6 h-6 text-white" />
                </div>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Send a Magic Link</h3>
              <p className="text-gray-600 leading-relaxed">Create a task and generate a unique link. Email it to anyone—candidates, trainees, students, contractors.</p>
            </div>

            {/* Step 2 */}
            <div className="bg-white rounded-2xl p-8 border border-gray-200 shadow-sm hover:shadow-xl hover:border-primary-200 transition">
              <div className="flex items-center gap-4 mb-5">
                <div className="w-10 h-10 bg-primary-500 rounded-full flex items-center justify-center text-white font-bold text-lg">2</div>
                <div className="w-12 h-12 bg-gradient-to-br from-primary-400 to-primary-500 rounded-xl flex items-center justify-center shadow-lg shadow-primary-500/25">
                  <Video className="w-6 h-6 text-white" />
                </div>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">They Click & Record</h3>
              <p className="text-gray-600 leading-relaxed">Recipients open the link, see the instructions, and record their screen in-browser. No signup. No install.</p>
            </div>

            {/* Step 3 */}
            <div className="bg-white rounded-2xl p-8 border border-gray-200 shadow-sm hover:shadow-xl hover:border-primary-200 transition">
              <div className="flex items-center gap-4 mb-5">
                <div className="w-10 h-10 bg-accent-500 rounded-full flex items-center justify-center text-white font-bold text-lg">3</div>
                <div className="w-12 h-12 bg-gradient-to-br from-accent-400 to-accent-500 rounded-xl flex items-center justify-center shadow-lg shadow-accent-500/25">
                  <CheckCircle className="w-6 h-6 text-white" />
                </div>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">You Review & Verify</h3>
              <p className="text-gray-600 leading-relaxed">Watch the submission with auto-generated transcript. Approve, reject, or request a re-take with feedback.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Why Magic Links Section */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-brand-navy via-brand-navy-dark to-brand-navy">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <div className="inline-flex items-center px-4 py-2 rounded-full bg-primary-500/10 text-primary-300 text-sm font-medium mb-6">
              <Zap className="w-4 h-4 mr-2" />
              The Magic Link Advantage
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-white">
              Why magic links <span className="text-primary-400">change everything</span>
            </h2>
            <p className="mt-4 text-lg text-gray-300">
              Traditional tools require everyone to create accounts. That friction kills adoption at scale.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                stat: '0',
                label: 'Accounts to create',
                detail: 'Recipients just click and record',
              },
              {
                stat: '30s',
                label: 'Time to first recording',
                detail: 'No onboarding or training needed',
              },
              {
                stat: '100%',
                label: 'Completion rate boost',
                detail: 'Remove signup friction entirely',
              },
              {
                stat: '∞',
                label: 'Scale without limits',
                detail: 'Assess thousands without user management',
              },
            ].map((item, i) => (
              <div key={i} className="text-center p-6 rounded-2xl bg-white/5 border border-white/10 hover:border-primary-500/30 transition">
                <div className="text-4xl font-bold text-primary-400 mb-2">{item.stat}</div>
                <div className="text-white font-medium mb-1">{item.label}</div>
                <div className="text-gray-400 text-sm">{item.detail}</div>
              </div>
            ))}
          </div>

          <div className="mt-16 grid md:grid-cols-3 gap-8">
            {[
              {
                title: 'Hiring & Recruitment',
                description: 'Send assessment links to 100 candidates. They record demos showing their skills. No accounts, no friction, no drop-off.',
                icon: Users,
              },
              {
                title: 'Training & Compliance',
                description: 'Verify 500 employees completed safety training. Each gets a link, records themselves, and you have proof.',
                icon: Shield,
              },
              {
                title: 'Education & Certification',
                description: 'Students submit video assignments via link. Grade submissions without managing student accounts.',
                icon: CheckCircle,
              },
            ].map((useCase, i) => (
              <div key={i} className="p-6 rounded-2xl bg-white/5 border border-white/10 hover:border-primary-500/30 transition">
                <useCase.icon className="w-10 h-10 text-primary-400 mb-4" />
                <h3 className="text-xl font-semibold text-white mb-2">{useCase.title}</h3>
                <p className="text-gray-400">{useCase.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <p className="text-primary-600 font-semibold mb-4 uppercase tracking-wider text-sm">Testimonials</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
              Loved by teams <span className="text-primary-600">everywhere</span>
            </h2>
            <p className="mt-4 text-lg text-gray-600">
              See what our customers have to say about CogVeri.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                quote: "CogVeri transformed how we onboard new team members. The structured review process ensures quality every time.",
                author: "Sarah Chen",
                role: "Head of Training, TechCorp",
                rating: 5,
              },
              {
                quote: "The magic link feature is brilliant. We can assess external contractors and candidates without any friction.",
                author: "Marcus Johnson",
                role: "Recruitment Lead, StartupXYZ",
                rating: 5,
              },
              {
                quote: "Finally, a tool that understands enterprise requirements. SSO and audit logs were must-haves for us.",
                author: "Emily Rodriguez",
                role: "IT Director, Enterprise Inc",
                rating: 5,
              },
            ].map((testimonial, i) => (
              <div key={i} className="bg-white rounded-2xl p-8 border border-gray-200 shadow-lg hover:shadow-xl hover:border-primary-200 transition">
                <div className="flex gap-1 mb-4">
                  {Array(testimonial.rating).fill(0).map((_, j) => (
                    <Star key={j} className="w-5 h-5 text-accent-500 fill-current" />
                  ))}
                </div>
                <p className="text-gray-700 mb-6 text-lg leading-relaxed">"{testimonial.quote}"</p>
                <div>
                  <p className="font-semibold text-gray-900">{testimonial.author}</p>
                  <p className="text-sm text-gray-500">{testimonial.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-brand-navy relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary-500/20 rounded-full blur-3xl" />
        </div>

        <div className="max-w-4xl mx-auto text-center relative z-10">
          <h2 className="text-4xl sm:text-5xl font-bold text-white mb-6">
            Know what your people
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-primary-400 to-accent-400"> actually know</span>
          </h2>
          <p className="text-xl text-gray-400 mb-10 max-w-2xl mx-auto">
            Start verifying skills and competency with video-based assessments.
            No credit card required.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            {featureFlags.COMING_SOON_MODE ? (
              <span className="w-full sm:w-auto bg-gray-500 text-white px-8 py-4 rounded-xl text-lg font-semibold cursor-not-allowed flex items-center justify-center">
                <Bell className="mr-2 w-5 h-5" />
                Coming Soon
              </span>
            ) : (
              <Link
                to="/register"
                className="group w-full sm:w-auto bg-accent-500 hover:bg-accent-600 text-white px-8 py-4 rounded-xl text-lg font-semibold transition shadow-2xl shadow-accent-500/25 flex items-center justify-center"
              >
                Start Free Trial
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
            )}
            <Link
              to="/pricing"
              className="w-full sm:w-auto text-white px-8 py-4 rounded-xl text-lg font-semibold border border-white/20 hover:bg-white/5 transition"
            >
              View Pricing
            </Link>
          </div>
        </div>
      </section>

      {/* Footer - Light theme for logo visibility */}
      <footer className="bg-gray-50 text-gray-600 py-16 px-4 sm:px-6 lg:px-8 border-t border-gray-200">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-12">
            <div>
              {/* Footer Logo - Using horizontal logo with styled CogVeri text */}
              <Link to="/" className="inline-block mb-4 group">
                <img
                  src="/cogveri-logo-horizontal.png"
                  alt="CogVeri"
                  className="h-10 w-auto transition-opacity group-hover:opacity-80"
                />
              </Link>
              <p className="text-sm text-gray-500">
                Video-based skills verification for training, hiring, and compliance.
              </p>
            </div>
            <div>
              <h4 className="text-gray-900 font-semibold mb-4">Product</h4>
              <ul className="space-y-3 text-sm">
                <li><a href="#features" className="hover:text-primary-600 transition">Features</a></li>
                <li><Link to="/pricing" className="hover:text-primary-600 transition">Pricing</Link></li>
                <li><a href="#" className="hover:text-primary-600 transition">Integrations</a></li>
                <li><a href="#" className="hover:text-primary-600 transition">Changelog</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-gray-900 font-semibold mb-4">Company</h4>
              <ul className="space-y-3 text-sm">
                <li><a href="#" className="hover:text-primary-600 transition">About</a></li>
                <li><a href="#" className="hover:text-primary-600 transition">Blog</a></li>
                <li><a href="#" className="hover:text-primary-600 transition">Careers</a></li>
                <li><a href="#" className="hover:text-primary-600 transition">Contact</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-gray-900 font-semibold mb-4">Legal</h4>
              <ul className="space-y-3 text-sm">
                <li><Link to="/privacy" className="hover:text-primary-600 transition">Privacy Policy</Link></li>
                <li><Link to="/terms" className="hover:text-primary-600 transition">Terms of Service</Link></li>
                <li><a href="#" className="hover:text-primary-600 transition">Cookie Policy</a></li>
                <li><a href="#" className="hover:text-primary-600 transition">Security</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-200 pt-8 flex flex-col sm:flex-row justify-between items-center">
            <p className="text-sm text-gray-500">&copy; {new Date().getFullYear()} CogVeri. All rights reserved.</p>
            <div className="flex space-x-6 mt-4 sm:mt-0">
              <a href="#" className="text-gray-500 hover:text-primary-600 transition">Twitter</a>
              <a href="#" className="text-gray-500 hover:text-primary-600 transition">LinkedIn</a>
              <a href="#" className="text-gray-500 hover:text-primary-600 transition">GitHub</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
