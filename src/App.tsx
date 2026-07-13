import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { TabProvider } from '@/contexts/TabContext';
import { UISettingsProvider } from '@/contexts/UISettingsContext';
import LoginPage from '@/pages/LoginPage';
import AuthCallback from '@/pages/AuthCallback';
import SalaryTemplatePrintPage from '@/pages/SalaryTemplatePrintPage';
import ApprovalDocumentPrintPage from '@/pages/ApprovalDocumentPrintPage';
import CrewResumePage from '@/pages/CrewResumePage';
import RotationPlanPrintPage from '@/pages/RotationPlanPrintPage';
import RotationPlanMonthPrintPage from '@/pages/RotationPlanMonthPrintPage';
import Layout from '@/components/Layout';
import { Toaster } from '@/components/ui/toaster';

function App() {
  return (
    <Router>
      <UISettingsProvider>
      <TabProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          {/* 사이드바/헤더/탭바를 완전히 우회하는 순수 인쇄 문서 라우트 (Layout 밖) */}
          <Route path="/print/salary-templates/:id" element={<SalaryTemplatePrintPage />} />
          <Route path="/print/documents/:id" element={<ApprovalDocumentPrintPage />} />
          <Route path="/print/crew/:id/resume" element={<CrewResumePage />} />
          <Route path="/print/rotation-plans/:id" element={<RotationPlanPrintPage />} />
          <Route path="/print/rotation-plans/month/:month" element={<RotationPlanMonthPrintPage />} />
          <Route path="*" element={<Layout />} />
        </Routes>
        <Toaster />
      </TabProvider>
      </UISettingsProvider>
    </Router>
  );
}

export default App;
