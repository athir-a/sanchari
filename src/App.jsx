import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppStateProvider } from './state/AppState.jsx';
import ArrivalSetup from './pages/ArrivalSetup.jsx';
import MatchResults from './pages/MatchResults.jsx';
import RideComparison from './pages/RideComparison.jsx';
import RideConfirmation from './pages/RideConfirmation.jsx';
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
          <Route path="/matches" element={<MatchResults />} />
          <Route path="/compare" element={<RideComparison />} />
          <Route path="/confirm" element={<RideConfirmation />} />
          <Route path="/ride" element={<RideCoordination />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </SiteLayout>
      </BrowserRouter>
    </AppStateProvider>
  );
}
