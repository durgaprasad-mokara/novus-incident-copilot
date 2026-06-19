import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import SignUp from './pages/SignUp';
import ForgotPassword from './pages/ForgotPassword';
import Settings from './pages/Settings';
import IncidentDashboard from './components/IncidentDashboard';
import IncidentDetail from './components/IncidentDetail';
import IncidentForm from './components/IncidentForm';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<SignUp />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/incidents" element={<IncidentDashboard />} />
      <Route path="/incidents/new" element={<IncidentForm />} />
      <Route path="/incidents/:id" element={<IncidentDetail />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
