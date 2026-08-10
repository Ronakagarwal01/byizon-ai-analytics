import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Routes, Route, useLocation } from "react-router-dom";
import { DataProvider } from "./context/DataContext";
import { ThemeProvider } from "./context/ThemeContext";

import Landing      from "./pages/Landing";
import UploadPage   from "./pages/UploadPage";
import Dashboard    from "./pages/Dashboard";
import Chat         from "./pages/Chat";
import Reports      from "./pages/Reports";
import SharedReport from "./pages/SharedReport";
import Connections  from "./pages/Connections";
import Home         from "./pages/Home";
import DashboardStudio from "./pages/DashboardStudio";
import SharedCustomDashboard from "./pages/SharedCustomDashboard";
import DynamicDashboardPage from "./pages/DynamicDashboardPage";
import Meetings from "./pages/Meetings";
import CalendarPage from "./pages/CalendarPage";
import VoiceAssistantPage from "./pages/VoiceAssistantPage";
import AnalyticsBriefPage from "./pages/AnalyticsBriefPage";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import Signup from "./pages/Signup";
import Login from "./pages/Login";
import OnboardingCompany from "./pages/OnboardingCompany";
import OnboardingTeam from "./pages/OnboardingTeam";
import OnboardingDataSource from "./pages/OnboardingDataSource";
import OnboardingAiWorkspace from "./pages/OnboardingAiWorkspace";
import OnboardingComplete from "./pages/OnboardingComplete";
import AIWebsiteGenerator from "./pages/AIWebsiteGenerator";
import GlobalVoiceAssistant from "./voice/GlobalVoiceAssistant";
import { getAuthSession } from "./api/universalBackend";

function AppVoiceAssistant() {
  return <GlobalVoiceAssistant />;
}

function ProtectedRoute({ children }) {
  const location = useLocation();
  const [session, setSession] = useState({ loading: true, user: null });

  useEffect(() => {
    let mounted = true;
    getAuthSession()
      .then(payload => {
        if (mounted) setSession({ loading: false, user: payload.user || null });
      })
      .catch(() => {
        if (mounted) setSession({ loading: false, user: null });
      });
    return () => { mounted = false; };
  }, [location.pathname]);

  if (session.loading) {
    return <main className="auth-check-screen" aria-live="polite">Loading your Byizon workspace...</main>;
  }

  if (!session.user?.authenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  const onboarding = session.user.onboarding || {};
  const isOnboardingRoute = location.pathname.startsWith('/onboarding');
  if (!onboarding.completed && !isOnboardingRoute) {
    return <Navigate to={onboarding.nextStep || '/onboarding/company'} replace />;
  }
  if (onboarding.completed && isOnboardingRoute) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <>
      {!isOnboardingRoute && <AppVoiceAssistant />}
      {children}
    </>
  );
}

function App() {
  return (
    <ThemeProvider>
      <DataProvider>
        <BrowserRouter>
          <Routes>
          <Route path="/"              element={<Landing />} />
          <Route path="/landing"       element={<Landing />}      />
          <Route path="/home"          element={<ProtectedRoute><Home /></ProtectedRoute>} />
          <Route path="/login"         element={<Login />}        />
          <Route path="/signup"        element={<Signup />}       />
          <Route path="/register"      element={<Signup />}       />
          <Route path="/verify-email"  element={<Navigate to="/dashboard" replace />} />
          <Route path="/onboarding"    element={<ProtectedRoute><OnboardingCompany /></ProtectedRoute>} />
          <Route path="/onboarding/company" element={<ProtectedRoute><OnboardingCompany /></ProtectedRoute>} />
          <Route path="/onboarding/team" element={<ProtectedRoute><OnboardingTeam /></ProtectedRoute>} />
          <Route path="/onboarding/data-source" element={<ProtectedRoute><OnboardingDataSource /></ProtectedRoute>} />
          <Route path="/onboarding/ai-workspace" element={<ProtectedRoute><OnboardingAiWorkspace /></ProtectedRoute>} />
          <Route path="/onboarding/complete" element={<ProtectedRoute><OnboardingComplete /></ProtectedRoute>} />
          <Route path="/privacy"       element={<Privacy />}      />
          <Route path="/terms"         element={<Terms />}        />
          <Route path="/upload"        element={<ProtectedRoute><UploadPage /></ProtectedRoute>} />
          <Route path="/dashboard"     element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/dashboard/:dashboardId" element={<ProtectedRoute><DynamicDashboardPage /></ProtectedRoute>} />
          <Route path="/chat"          element={<ProtectedRoute><Chat /></ProtectedRoute>} />
          <Route path="/voice"         element={<ProtectedRoute><VoiceAssistantPage /></ProtectedRoute>} />
          <Route path="/analytics"     element={<ProtectedRoute><AnalyticsBriefPage /></ProtectedRoute>} />
          <Route path="/reports"       element={<ProtectedRoute><Reports /></ProtectedRoute>} />
          <Route path="/connections"   element={<ProtectedRoute><Connections /></ProtectedRoute>} />
          <Route path="/meetings"      element={<ProtectedRoute><Meetings /></ProtectedRoute>} />
          <Route path="/calendar"      element={<ProtectedRoute><CalendarPage /></ProtectedRoute>} />
          <Route path="/studio"        element={<ProtectedRoute><DashboardStudio /></ProtectedRoute>} />
          <Route path="/studio/:reportId" element={<ProtectedRoute><DashboardStudio /></ProtectedRoute>} />
          <Route path="/custom-dashboard/:reportId" element={<SharedCustomDashboard />} />
          {/* BUG-03 FIX: Dynamic route — any reportId works, not just "abc123" */}
          <Route path="/report/:reportId" element={<SharedReport />} />
          <Route path="/generate-website" element={<ProtectedRoute><AIWebsiteGenerator /></ProtectedRoute>} />
          </Routes>
        </BrowserRouter>
      </DataProvider>
    </ThemeProvider>
  );
}

export default App;
