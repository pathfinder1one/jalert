import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { LoadingState } from '../components/LoadingState';
import { useAuth } from '../context/AuthContext';
import { MainLayout } from '../layouts/MainLayout';

const HomePage = lazy(() =>
  import('../pages/HomePage').then((module) => ({ default: module.HomePage })),
);
const AlertsPage = lazy(() =>
  import('../pages/AlertsPage').then((module) => ({ default: module.AlertsPage })),
);

const VillageStatusPage = lazy(() =>
  import('../pages/VillageStatusPage').then((module) => ({ default: module.VillageStatusPage })),
);
const FeatureCenterPage = lazy(() =>
  import('../pages/FeatureCenterPage').then((module) => ({ default: module.FeatureCenterPage })),
);
const VillageProfilePage = lazy(() =>
  import('../pages/VillageProfilePage').then((module) => ({ default: module.VillageProfilePage })),
);
const PredictionsPage = lazy(() =>
  import('../pages/PredictionsPage').then((module) => ({ default: module.PredictionsPage })),
);
const HealthReportsPage = lazy(() =>
  import('../pages/HealthReportsPage').then((module) => ({ default: module.HealthReportsPage })),
);
const SensorsPage = lazy(() => import('../pages/SensorsPage').then((module) => ({ default: module.SensorsPage })));
const ReportsPage = lazy(() => import('../pages/ReportsPage').then((module) => ({ default: module.ReportsPage })));
const CitizenServicesPage = lazy(() =>
  import('../pages/CitizenServicesPage').then((module) => ({ default: module.CitizenServicesPage })),
);
const ProfilePage = lazy(() => import('../pages/ProfilePage').then((module) => ({ default: module.ProfilePage })));
const NotificationsPage = lazy(() =>
  import('../pages/NotificationsPage').then((module) => ({ default: module.NotificationsPage })),
);
const LoginPage = lazy(() => import('../pages/LoginPage').then((module) => ({ default: module.LoginPage })));
const AdminLoginPage = lazy(() =>
  import('../pages/AdminLoginPage').then((module) => ({ default: module.AdminLoginPage })),
);
const RegisterPage = lazy(() =>
  import('../pages/RegisterPage').then((module) => ({ default: module.RegisterPage })),
);
const AdminPortalPage = lazy(() =>
  import('../pages/AdminPortalPage').then((module) => ({ default: module.AdminPortalPage })),
);
const NotFoundPage = lazy(() =>
  import('../pages/NotFoundPage').then((module) => ({ default: module.NotFoundPage })),
);
const AssistantPage = lazy(() =>
  import('../pages/AssistantPage').then((module) => ({ default: module.AssistantPage })),
);

export const AppRouter = () => {
  const { isAuthenticated, isLoading, user } = useAuth();

  return (
    <Suspense
      fallback={
        <main className="page-shell">
          <LoadingState label="Opening JALERT..." />
        </main>
      }
    >
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/feature-center" element={<FeatureCenterPage />} />
          <Route path="/village-profile" element={<VillageProfilePage />} />
          <Route path="/village-status" element={<VillageStatusPage />} />
          <Route path="/citizen-services" element={<CitizenServicesPage />} />
          <Route path="/predictions" element={<PredictionsPage />} />
          <Route path="/health-reports" element={<HealthReportsPage />} />
          <Route path="/sensors" element={<SensorsPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/chat" element={<AssistantPage />} />
          <Route
            path="/notifications"
            element={isAuthenticated ? <NotificationsPage /> : <Navigate replace to="/login" />}
          />
          <Route
            path="/admin-portal"
            element={
              isLoading ? (
                <main className="page-shell">
                  <LoadingState label="Opening administrator portal..." />
                </main>
              ) : isAuthenticated && user?.role === 'admin' ? (
                <AdminPortalPage />
              ) : (
                <Navigate replace to="/admin/login" />
              )
            }
          />
          <Route
            path="/profile"
            element={isAuthenticated ? <ProfilePage /> : <Navigate replace to="/login" />}
          />
        </Route>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
};
