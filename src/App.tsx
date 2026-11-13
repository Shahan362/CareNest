import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import ChooseAgencyPage from "./pages/ChooseAgencyPage";
import SignupPage from "./pages/SignupPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import { PrivacyPage, TermsPage } from "./pages/LegalPages";
import ProtectedRoute, { FullPageSpinner } from "./components/auth/ProtectedRoute";
import ErrorBoundary from "./components/ErrorBoundary";
import { AuthProvider } from "./contexts/AuthContext";
import RealtimeSync from "./components/realtime/RealtimeSync";

// Each role's pages are downloaded only when first opened (smaller first load on phones).
// Admin Routes
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminCalendar = lazy(() => import("./pages/admin/AdminCalendar"));
const AdminScheduler = lazy(() => import("./pages/admin/AdminScheduler"));
const AdminCaregivers = lazy(() => import("./pages/admin/AdminCaregivers"));
const AdminRequests = lazy(() => import("./pages/admin/AdminRequests"));
const AdminPatients = lazy(() => import("./pages/admin/AdminPatients"));
const AdminBilling = lazy(() => import("./pages/admin/AdminBilling"));
const AdminInvoiceDetails = lazy(() => import("./pages/admin/AdminInvoiceDetails"));
const AdminReports = lazy(() => import("./pages/admin/AdminReports"));
const AdminMessages = lazy(() => import("./pages/admin/AdminMessages"));
const AdminNotifications = lazy(() => import("./pages/admin/AdminNotifications"));
const AdminSettings = lazy(() => import("./pages/admin/AdminSettings"));

// Caregiver Routes
const CaregiverDashboard = lazy(() => import("./pages/caregiver/CaregiverDashboard"));
const CaregiverSchedule = lazy(() => import("./pages/caregiver/CaregiverSchedule"));
const CaregiverVisit = lazy(() => import("./pages/caregiver/CaregiverVisit"));
const CaregiverPatients = lazy(() => import("./pages/caregiver/CaregiverPatients"));
const CaregiverPatientDetails = lazy(() => import("./pages/caregiver/CaregiverPatientDetails"));
const CaregiverMessages = lazy(() => import("./pages/caregiver/CaregiverMessages"));
const CaregiverNotifications = lazy(() => import("./pages/caregiver/CaregiverNotifications"));
const CaregiverProfile = lazy(() => import("./pages/caregiver/CaregiverProfile"));

// Patient Routes
const PatientDashboard = lazy(() => import("./pages/patient/PatientDashboard"));
const PatientVisits = lazy(() => import("./pages/patient/PatientVisits"));
const PatientCarePlan = lazy(() => import("./pages/patient/PatientCarePlan"));
const PatientRequests = lazy(() => import("./pages/patient/PatientRequests"));
const PatientFeedback = lazy(() => import("./pages/patient/PatientFeedback"));
const PatientMessages = lazy(() => import("./pages/patient/PatientMessages"));
const PatientNotifications = lazy(() => import("./pages/patient/PatientNotifications"));
const PatientInvoices = lazy(() => import("./pages/patient/PatientInvoices"));
const PatientInvoiceDetails = lazy(() => import("./pages/patient/PatientInvoiceDetails"));
const PatientProfile = lazy(() => import("./pages/patient/PatientProfile"));

import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <RealtimeSync />
            <ErrorBoundary>
            <Suspense fallback={<FullPageSpinner />}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/choose-agency" element={<ChooseAgencyPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/terms" element={<TermsPage />} />
            
            {/* Admin Routes */}
            <Route element={<ProtectedRoute role="admin" />}>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/calendar" element={<AdminCalendar />} />
            <Route path="/admin/scheduler" element={<AdminScheduler />} />
            <Route path="/admin/caregivers" element={<AdminCaregivers />} />
            <Route path="/admin/requests" element={<AdminRequests />} />
            <Route path="/admin/patients" element={<AdminPatients />} />
            <Route path="/admin/billing" element={<AdminBilling />} />
            <Route path="/admin/billing/:invoiceId" element={<AdminInvoiceDetails />} />
            <Route path="/admin/reports" element={<AdminReports />} />
            <Route path="/admin/messages" element={<AdminMessages />} />
            <Route path="/admin/notifications" element={<AdminNotifications />} />
            <Route path="/admin/settings" element={<AdminSettings />} />
            </Route>
            
            {/* Caregiver Routes */}
            <Route element={<ProtectedRoute role="caregiver" />}>
            <Route path="/caregiver" element={<CaregiverDashboard />} />
            <Route path="/caregiver/schedule" element={<CaregiverSchedule />} />
            <Route path="/caregiver/visits/:visitId" element={<CaregiverVisit />} />
            <Route path="/caregiver/patients" element={<CaregiverPatients />} />
            <Route path="/caregiver/patients/:patientId" element={<CaregiverPatientDetails />} />
            <Route path="/caregiver/messages" element={<CaregiverMessages />} />
            <Route path="/caregiver/notifications" element={<CaregiverNotifications />} />
            <Route path="/caregiver/profile" element={<CaregiverProfile />} />
            </Route>
            
            {/* Patient Routes */}
            <Route element={<ProtectedRoute role="patient" />}>
            <Route path="/patient" element={<PatientDashboard />} />
            <Route path="/patient/visits" element={<PatientVisits />} />
            <Route path="/patient/care-plan" element={<PatientCarePlan />} />
            <Route path="/patient/requests" element={<PatientRequests />} />
            <Route path="/patient/feedback" element={<PatientFeedback />} />
            <Route path="/patient/messages" element={<PatientMessages />} />
            <Route path="/patient/notifications" element={<PatientNotifications />} />
            <Route path="/patient/invoices" element={<PatientInvoices />} />
            <Route path="/patient/invoices/:invoiceId" element={<PatientInvoiceDetails />} />
            <Route path="/patient/profile" element={<PatientProfile />} />
            </Route>
            
            {/* Catch-all route for 404 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
            </Suspense>
            </ErrorBoundary>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
