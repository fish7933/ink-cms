import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { TabProvider } from '@/contexts/TabContext';
import LoginPage from '@/pages/LoginPage';
import AuthCallback from '@/pages/AuthCallback';
import Layout from '@/components/Layout';
import { Toaster } from '@/components/ui/toaster';

function App() {
  return (
    <Router>
      <TabProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="*" element={<Layout />} />
        </Routes>
        <Toaster />
      </TabProvider>
    </Router>
  );
}

export default App;
