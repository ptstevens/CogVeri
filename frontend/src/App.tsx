import { Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import { OrganizationProvider } from './contexts/OrganizationContext';
import { SocketProvider } from './contexts/SocketContext';
import Layout from './components/layout/Layout';
import LoadingSpinner from './components/ui/LoadingSpinner';
import ProtectedRoute from './components/common/ProtectedRoute';
import AdminRoute from './components/common/AdminRoute';
import { PageErrorBoundary } from './components/ErrorBoundary';
// Coming Soon banner disabled - platform is operational
// import ComingSoonBanner from './components/ui/ComingSoonBanner';
// import { featureFlags } from './config/featureFlags';

// Lazy load pages for code splitting
// Marketing pages hidden - redirecting to login
// const LandingPage = lazy(() => import('./pages/public/LandingPage'));
// const Pricing = lazy(() => import('./pages/public/Pricing'));
// const Enterprise = lazy(() => import('./pages/public/Enterprise'));
const Dashboard = lazy(() => import('./pages/dashboard/Dashboard'));
const Login = lazy(() => import('./pages/auth/Login'));
// const Register = lazy(() => import('./pages/auth/Register')); // Registration disabled - admin creates orgs
const OAuthCallback = lazy(() => import('./pages/auth/OAuthCallback'));
const JoinOrganization = lazy(() => import('./pages/auth/JoinOrganization'));
const AccountSuspended = lazy(() => import('./pages/auth/AccountSuspended'));
const PrivacyPolicy = lazy(() => import('./pages/public/PrivacyPolicy'));
const TermsOfService = lazy(() => import('./pages/public/TermsOfService'));
const Tasks = lazy(() => import('./pages/tasks/Tasks'));
const TaskDetail = lazy(() => import('./pages/tasks/TaskDetail'));
const Recordings = lazy(() => import('./pages/recordings/Recordings'));
const RecordingSession = lazy(() => import('./pages/recordings/RecordingSession'));
const Reviews = lazy(() => import('./pages/reviews/Reviews'));
const ReviewDetail = lazy(() => import('./pages/reviews/ReviewDetail'));
const TaskReview = lazy(() => import('./pages/reviews/TaskReview'));
const LiveSession = lazy(() => import('./pages/LiveSession'));
const Profile = lazy(() => import('./pages/profile/Profile'));
const PublicTaskPage = lazy(() => import('./pages/public/PublicTaskPage'));
const OrganizationSettings = lazy(() => import('./pages/settings/OrganizationSettings'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminOrganizations = lazy(() => import('./pages/admin/AdminOrganizations'));
const AdminOrganizationDetail = lazy(() => import('./pages/admin/AdminOrganizationDetail'));
const AdminPricing = lazy(() => import('./pages/admin/AdminPricing'));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'));
const AdminSystemAdmins = lazy(() => import('./pages/admin/AdminSystemAdmins'));
const AdminVideoUpload = lazy(() => import('./pages/admin/AdminVideoUpload'));
const AdminLayout = lazy(() => import('./components/admin/AdminLayout'));
const RubricBuilderPage = lazy(() => import('./pages/rubric/RubricBuilderPage'));
const AnalysisResultsPage = lazy(() => import('./pages/analysis/AnalysisResultsPage'));
const KnowledgeBase = lazy(() => import('./pages/knowledge-base'));
const NotFound = lazy(() => import('./pages/NotFound'));

function App() {
  return (
    <AuthProvider>
      <OrganizationProvider>
        <SocketProvider>
        <PageErrorBoundary>
          <Suspense fallback={<LoadingSpinner />}>
            <Routes>
            {/* Public routes - marketing pages redirect to login */}
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/pricing" element={<Navigate to="/login" replace />} />
            <Route path="/enterprise" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Navigate to="/login" replace />} />
            <Route path="/auth/callback" element={<OAuthCallback />} />
            <Route path="/auth/join-organization" element={<JoinOrganization />} />
            <Route path="/account-suspended" element={<AccountSuspended />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<TermsOfService />} />
            <Route path="/t/:token" element={<PublicTaskPage />} />

            {/* Protected routes with Layout */}
            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route path="dashboard" element={<Dashboard />} />

              {/* Tasks */}
              <Route path="tasks">
                <Route index element={<Tasks />} />
                <Route path=":id" element={<TaskDetail />} />
                <Route path=":taskId/review" element={<TaskReview />} />
                <Route path=":taskId/live" element={<LiveSession />} />
              </Route>

              {/* Recordings */}
              <Route path="record">
                <Route index element={<Recordings />} />
                <Route path="new" element={<RecordingSession />} />
                <Route path=":id" element={<RecordingSession />} />
              </Route>

              {/* Recording Analysis */}
              <Route path="recordings/:recordingId/analysis" element={<AnalysisResultsPage />} />

              {/* Rubric Builder */}
              <Route path="templates/:templateId/rubric" element={<RubricBuilderPage />} />

              {/* Reviews */}
              <Route path="reviews">
                <Route index element={<Reviews />} />
                <Route path=":id" element={<ReviewDetail />} />
              </Route>

              {/* Profile */}
              <Route path="profile" element={<Profile />} />

              {/* Settings - consolidated under organizations/settings */}
              <Route path="organizations">
                <Route path="settings" element={<OrganizationSettings />} />
              </Route>

              {/* Knowledge Base */}
              <Route path="knowledge-base">
                <Route index element={<KnowledgeBase />} />
                <Route path=":articleSlug" element={<KnowledgeBase />} />
              </Route>

              {/* Admin Routes - wrapped in AdminLayout for navigation */}
              <Route path="admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
                <Route index element={<AdminDashboard />} />
                <Route path="organizations" element={<AdminOrganizations />} />
                <Route path="organizations/:organizationId" element={<AdminOrganizationDetail />} />
                <Route path="pricing" element={<AdminPricing />} />
                <Route path="settings" element={<AdminSettings />} />
                <Route path="system-admins" element={<AdminSystemAdmins />} />
                <Route path="video-upload" element={<AdminVideoUpload />} />
              </Route>
            </Route>

            {/* 404 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
        </PageErrorBoundary>
      </SocketProvider>
    </OrganizationProvider>
    </AuthProvider>
  );
}

export default App;