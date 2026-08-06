import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { DataProvider } from "./context/DataContext";

import Landing      from "./Pages/Landing";
import UploadPage   from "./Pages/UploadPage";
import Dashboard    from "./Pages/Dashboard";
import Chat         from "./Pages/chat";
import Reports      from "./Pages/Reports";
import SharedReport from "./Pages/SharedReport";
import Connections  from "./Pages/Connections";
import Home         from "./Pages/Home";
import DashboardStudio from "./Pages/DashboardStudio";
import SharedCustomDashboard from "./Pages/SharedCustomDashboard";
import Meetings from "./Pages/Meetings";
import CalendarPage from "./Pages/CalendarPage";
import Privacy from "./Pages/Privacy";
import Terms from "./Pages/Terms";
import GlobalVoiceAssistant from "./voice/GlobalVoiceAssistant";

function AppVoiceAssistant() {
  const { pathname } = useLocation();
  const isPublicPage = ["/landing", "/privacy", "/terms"].includes(pathname);
  return isPublicPage ? null : <GlobalVoiceAssistant />;
}

function App() {
  return (
    <DataProvider>
      <BrowserRouter>
        <AppVoiceAssistant />
        <Routes>
          <Route path="/"              element={<Home />}         />
          <Route path="/landing"       element={<Landing />}      />
          <Route path="/privacy"       element={<Privacy />}      />
          <Route path="/terms"         element={<Terms />}        />
          <Route path="/upload"        element={<UploadPage />}   />
          <Route path="/dashboard"     element={<Dashboard />}    />
          <Route path="/chat"          element={<Chat />}         />
          <Route path="/reports"       element={<Reports />}      />
          <Route path="/connections"   element={<Connections />}  />
          <Route path="/meetings"      element={<Meetings />}     />
          <Route path="/calendar"      element={<CalendarPage />} />
          <Route path="/studio"        element={<DashboardStudio />} />
          <Route path="/studio/:reportId" element={<DashboardStudio />} />
          <Route path="/custom-dashboard/:reportId" element={<SharedCustomDashboard />} />
          {/* BUG-03 FIX: Dynamic route — any reportId works, not just "abc123" */}
          <Route path="/report/:reportId" element={<SharedReport />} />
        </Routes>
      </BrowserRouter>
    </DataProvider>
  );
}

export default App;
