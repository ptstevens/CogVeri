import { Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import { SocketProvider } from './contexts/SocketContext';
import Layout from './components/layout/Layout';
import LoadingSpinner from './components/ui/LoadingSpinner';
import ProtectedRoute from './components/common/ProtectedRoute';

// Lazy load pages for code splitting
const Dashboard = lazy(() => import('./pages/dashboard/Dashboard'));
const Login = lazy(() => import('./pages/auth/Login'));
const Register = lazy(() => import('./pages/auth/Register'));
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
const NotFound = lazy(() => import('./pages/NotFound'));

function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <Suspense fallback={<LoadingSpinner fullScreen />}>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/t/:token" element={<PublicTaskPage />} />

            {/* Protected routes */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/dashboard" replace />} />
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

              {/* Reviews */}
              <Route path="reviews">
                <Route index element={<Reviews />} />
                <Route path=":id" element={<ReviewDetail />} />
              </Route>

              {/* Profile */}
              <Route path="profile" element={<Profile />} />
            </Route>

            {/* 404 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </SocketProvider>
    </AuthProvider>
  );
}

export default App;