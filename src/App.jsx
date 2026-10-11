import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppStateProvider } from './state/AppState.jsx';
import ArrivalSetup from './pages/ArrivalSetup.jsx';
import MatchProposal from './pages/MatchProposal.jsx';
import RideCoordination from './pages/RideCoordination.jsx';
import Arrivals from './pages/Arrivals.jsx';
import { LiveInviteCheck } from './components/LiveInviteCheck.jsx';
import { SiteLayout } from './components/SiteLayout.jsx';

export default function App() {
  return (
    <AppStateProvider>
      <BrowserRouter>
        <LiveInviteCheck />
        <SiteLayout>
          <Routes>
            <Route path="/" element={<ArrivalSetup />} />
            <Route path="/arrivals" element={<Arrivals />} />
            <Route path="/match" element={<MatchProposal />} />
            <Route path="/ride" element={<RideCoordination />} />
            {/* Older links */}
            <Route path="/matches" element={<Navigate to="/match" replace />} />
            <Route path="/compare" element={<Navigate to="/match" replace />} />
            <Route path="/confirm" element={<Navigate to="/match" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </SiteLayout>
      </BrowserRouter>
    </AppStateProvider>
  );
}
