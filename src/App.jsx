import { BrowserRouter, Routes, Route } from "react-router-dom";
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
import VerifyEmail from "./pages/VerifyEmail";
import AIWebsiteGenerator from "./pages/AIWebsiteGenerator";
import GlobalVoiceAssistant from "./voice/GlobalVoiceAssistant";

function AppVoiceAssistant() {
  return <GlobalVoiceAssistant />;
}

function App() {
  return (
    <ThemeProvider>
      <DataProvider>
        <BrowserRouter>
          <AppVoiceAssistant />
          <Routes>
          <Route path="/"              element={<Home />}         />
          <Route path="/landing"       element={<Landing />}      />
          <Route path="/login"         element={<Login />}        />
          <Route path="/signup"        element={<Signup />}       />
          <Route path="/register"      element={<Signup />}       />
          <Route path="/verify-email"  element={<VerifyEmail />}  />
          <Route path="/onboarding"    element={<OnboardingCompany />} />
          <Route path="/onboarding/company" element={<OnboardingCompany />} />
          <Route path="/onboarding/team" element={<OnboardingTeam />} />
          <Route path="/onboarding/data-source" element={<OnboardingDataSource />} />
          <Route path="/onboarding/ai-workspace" element={<OnboardingAiWorkspace />} />
          <Route path="/onboarding/complete" element={<OnboardingComplete />} />
          <Route path="/privacy"       element={<Privacy />}      />
          <Route path="/terms"         element={<Terms />}        />
          <Route path="/upload"        element={<UploadPage />}   />
          <Route path="/dashboard"     element={<Dashboard />}    />
          <Route path="/dashboard/:dashboardId" element={<DynamicDashboardPage />} />
          <Route path="/chat"          element={<Chat />}         />
          <Route path="/voice"         element={<VoiceAssistantPage />} />
          <Route path="/analytics"     element={<AnalyticsBriefPage />} />
          <Route path="/reports"       element={<Reports />}      />
          <Route path="/connections"   element={<Connections />}  />
          <Route path="/meetings"      element={<Meetings />}     />
          <Route path="/calendar"      element={<CalendarPage />} />
          <Route path="/studio"        element={<DashboardStudio />} />
          <Route path="/studio/:reportId" element={<DashboardStudio />} />
          <Route path="/custom-dashboard/:reportId" element={<SharedCustomDashboard />} />
          {/* BUG-03 FIX: Dynamic route — any reportId works, not just "abc123" */}
          <Route path="/report/:reportId" element={<SharedReport />} />
          <Route path="/generate-website" element={<AIWebsiteGenerator />} />
          </Routes>
        </BrowserRouter>
      </DataProvider>
    </ThemeProvider>
  );
}

export default App;
