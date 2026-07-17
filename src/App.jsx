import { BrowserRouter, Routes, Route } from "react-router-dom";
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
import GlobalVoiceAssistant from "./voice/GlobalVoiceAssistant";

function App() {
  return (
    <DataProvider>
      <BrowserRouter>
        <GlobalVoiceAssistant />
        <Routes>
          <Route path="/"              element={<Home />}         />
          <Route path="/landing"       element={<Landing />}      />
          <Route path="/upload"        element={<UploadPage />}   />
          <Route path="/dashboard"     element={<Dashboard />}    />
          <Route path="/chat"          element={<Chat />}         />
          <Route path="/reports"       element={<Reports />}      />
          <Route path="/connections"   element={<Connections />}  />
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
