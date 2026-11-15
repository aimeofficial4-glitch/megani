import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { ConsentProvider } from './context/ConsentContext';
import { Navbar } from './components/common/Navbar';
import { Footer } from './components/common/Footer';
import { ToastContainer } from './components/common/ToastContainer';
import { CommandSearchModal } from './components/common/CommandSearchModal';
import { CookieConsentBanner } from './components/privacy/CookieConsentBanner';
import { CookieCustomizeModal } from './components/privacy/CookieCustomizeModal';
import { ProtectedRoute, AdminRoute } from './components/common/AuthGuard';

// Public & Discovery Pages
import { HomePage } from './pages/HomePage';
import { ExplorePage } from './pages/ExplorePage';
import { CategoriesPage } from './pages/CategoriesPage';
import { CategoryDetailPage } from './pages/CategoryDetailPage';
import { SearchResultsPage } from './pages/SearchResultsPage';

// Core Workspaces
import { ResearchIntelligencePage } from './pages/ResearchIntelligencePage';
import { AskPage } from './pages/AskPage';
import { ResearchBuilderPage } from './pages/ResearchBuilderPage';
import { VideosPage } from './pages/VideosPage';
import { VideoDetailPage } from './pages/VideoDetailPage';
import { VideoUploadPage } from './pages/VideoUploadPage';
import { MyVideosPage } from './pages/MyVideosPage';
import { KnowledgeMapPage } from './pages/KnowledgeMapPage';
import { MyKnowledgePage } from './pages/MyKnowledgePage';
import { NotesWorkspacePage } from './pages/NotesWorkspacePage';

// Commerce, Company, Support & Legal
import { PricingPage } from './pages/PricingPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { AboutPage } from './pages/AboutPage';
import { ContactPage } from './pages/ContactPage';
import { HelpCenterPage } from './pages/HelpCenterPage';
import { FeedbackPage } from './pages/FeedbackPage';
import { PrivacyPolicyPage } from './pages/PrivacyPolicyPage';
import { TermsOfServicePage } from './pages/TermsOfServicePage';
import { NotFoundPage } from './pages/NotFoundPage';

// Authentication
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';

// User Account Pages
import { UserDashboardPage } from './pages/UserDashboardPage';
import { ProfilePage } from './pages/ProfilePage';
import { SettingsPage } from './pages/SettingsPage';
import { PrivacySettingsPage } from './pages/PrivacySettingsPage';
import { SubscriptionPage } from './pages/SubscriptionPage';
import { NotificationsPage } from './pages/NotificationsPage';

// Admin Console Pages
import { AdminLoginPage } from './pages/admin/AdminLoginPage';
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage';
import { AdminUsersPage } from './pages/admin/AdminUsersPage';
import { AdminRolesPage } from './pages/admin/AdminRolesPage';
import { AdminAiProvidersPage } from './pages/admin/AdminAiProvidersPage';
import { AdminAiPerformancePage } from './pages/admin/AdminAiPerformancePage';
import { AdminAiUsagePage } from './pages/admin/AdminAiUsagePage';
import { AdminAdsPage } from './pages/admin/AdminAdsPage';
import { AdminAdvertisersPage } from './pages/admin/AdminAdvertisersPage';
import { AdminCampaignsPage } from './pages/admin/AdminCampaignsPage';
import { AdminContentPage } from './pages/admin/AdminContentPage';
import { AdminVideosPage } from './pages/admin/AdminVideosPage';
import { AdminCategoriesPage } from './pages/admin/AdminCategoriesPage';
import { AdminFeedbackPage } from './pages/admin/AdminFeedbackPage';
import { AdminPaymentsPage } from './pages/admin/AdminPaymentsPage';
import { AdminMomoIntegrationPage } from './pages/admin/AdminMomoIntegrationPage';
import { AdminMomoBalancePage } from './pages/admin/AdminMomoBalancePage';
import { AdminSubscriptionsPage } from './pages/admin/AdminSubscriptionsPage';
import { AdminNotificationsPage } from './pages/admin/AdminNotificationsPage';
import { AdminReportsPage } from './pages/admin/AdminReportsPage';
import { AdminDemoDataPage } from './pages/admin/AdminDemoDataPage';
import { AdminSecurityPage } from './pages/admin/AdminSecurityPage';
import { AdminPrivacyConsentPage } from './pages/admin/AdminPrivacyConsentPage';
import { AdminAuditLogsPage } from './pages/admin/AdminAuditLogsPage';
import { AdminSystemSettingsPage } from './pages/admin/AdminSystemSettingsPage';
import { AdminSocialMediaPage } from './pages/admin/AdminSocialMediaPage';
import { AdminBrandKnowledgePage } from './pages/admin/AdminBrandKnowledgePage';

const ScrollToTop: React.FC = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
};

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <ConsentProvider>
          <ScrollToTop />
          <div className="min-h-screen flex flex-col bg-[#F5F7FA] text-[#071426] dark:bg-[#071426] dark:text-white transition-colors">
            <Navbar />
            <main className="flex-1">
            <Routes>
              {/* Public Discovery & Search */}
              <Route path="/" element={<HomePage />} />
              <Route path="/explore" element={<ExplorePage />} />
              <Route path="/explore/:slug" element={<ExplorePage />} />
              <Route path="/categories" element={<CategoriesPage />} />
              <Route path="/categories/:slug" element={<CategoryDetailPage />} />
              <Route path="/search" element={<SearchResultsPage />} />

              {/* Core Research Workspaces */}
              <Route path="/research" element={<ResearchIntelligencePage />} />
              <Route path="/ask" element={<AskPage />} />
              <Route path="/research-builder" element={<ResearchBuilderPage />} />
              <Route path="/videos" element={<VideosPage />} />
              <Route
                path="/videos/upload"
                element={
                  <ProtectedRoute>
                    <VideoUploadPage />
                  </ProtectedRoute>
                }
              />
              <Route path="/videos/:id" element={<VideoDetailPage />} />
              <Route path="/knowledge-map" element={<KnowledgeMapPage />} />
              <Route path="/my-knowledge" element={<MyKnowledgePage />} />
              <Route
                path="/my-knowledge/notes"
                element={
                  <ProtectedRoute>
                    <NotesWorkspacePage />
                  </ProtectedRoute>
                }
              />

              {/* Pricing, Checkout & Support */}
              <Route path="/pricing" element={<PricingPage />} />
              <Route path="/checkout" element={<CheckoutPage />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="/contact" element={<ContactPage />} />
              <Route path="/help" element={<HelpCenterPage />} />
              <Route path="/feedback" element={<FeedbackPage />} />
              <Route path="/privacy" element={<PrivacyPolicyPage />} />
              <Route path="/terms" element={<TermsOfServicePage />} />

              {/* Auth Routes */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />

              {/* Protected User Dashboard Routes */}
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <UserDashboardPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/my-videos"
                element={
                  <ProtectedRoute>
                    <MyVideosPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/profile"
                element={
                  <ProtectedRoute>
                    <ProfilePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/settings"
                element={
                  <ProtectedRoute>
                    <SettingsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/settings/privacy"
                element={
                  <ProtectedRoute>
                    <PrivacySettingsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/subscription"
                element={
                  <ProtectedRoute>
                    <SubscriptionPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/notifications"
                element={
                  <ProtectedRoute>
                    <NotificationsPage />
                  </ProtectedRoute>
                }
              />

              {/* Dedicated Admin Login Portal */}
              <Route path="/admin/login" element={<AdminLoginPage />} />

              {/* Strictly Protected Admin Routes */}
              <Route
                path="/admin"
                element={
                  <AdminRoute>
                    <AdminDashboardPage />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/users"
                element={
                  <AdminRoute>
                    <AdminUsersPage />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/roles"
                element={
                  <AdminRoute>
                    <AdminRolesPage />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/ai-providers"
                element={
                  <AdminRoute>
                    <AdminAiProvidersPage />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/ai-performance"
                element={
                  <AdminRoute>
                    <AdminAiPerformancePage />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/ai-usage"
                element={
                  <AdminRoute>
                    <AdminAiUsagePage />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/advertisements"
                element={
                  <AdminRoute>
                    <AdminAdsPage />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/advertisers"
                element={
                  <AdminRoute>
                    <AdminAdvertisersPage />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/campaigns"
                element={
                  <AdminRoute>
                    <AdminCampaignsPage />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/content"
                element={
                  <AdminRoute>
                    <AdminContentPage />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/videos"
                element={
                  <AdminRoute>
                    <AdminVideosPage />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/categories"
                element={
                  <AdminRoute>
                    <AdminCategoriesPage />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/feedback"
                element={
                  <AdminRoute>
                    <AdminFeedbackPage />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/payments"
                element={
                  <AdminRoute>
                    <AdminPaymentsPage />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/momo/integration"
                element={
                  <AdminRoute>
                    <AdminMomoIntegrationPage />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/momo/balance"
                element={
                  <AdminRoute>
                    <AdminMomoBalancePage />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/subscriptions"
                element={
                  <AdminRoute>
                    <AdminSubscriptionsPage />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/notifications"
                element={
                  <AdminRoute>
                    <AdminNotificationsPage />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/reports"
                element={
                  <AdminRoute>
                    <AdminReportsPage />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/demo-data"
                element={
                  <AdminRoute>
                    <AdminDemoDataPage />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/settings/security"
                element={
                  <AdminRoute>
                    <AdminSecurityPage />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/privacy/consent"
                element={
                  <AdminRoute>
                    <AdminPrivacyConsentPage />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/audit-logs"
                element={
                  <AdminRoute>
                    <AdminAuditLogsPage />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/settings/system"
                element={
                  <AdminRoute>
                    <AdminSystemSettingsPage />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/settings/social-media"
                element={
                  <AdminRoute>
                    <AdminSocialMediaPage />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/brand-knowledge"
                element={
                  <AdminRoute>
                    <AdminBrandKnowledgePage />
                  </AdminRoute>
                }
              />

              {/* 404 & Catch-all */}
              <Route path="/404" element={<NotFoundPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </main>
            <Footer />
            <CommandSearchModal />
            <CookieConsentBanner />
            <CookieCustomizeModal />
            <ToastContainer />
          </div>
        </ConsentProvider>
      </BrowserRouter>
    </AppProvider>
  );
}
