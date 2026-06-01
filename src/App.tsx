import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import CrewManagementPage from '@/pages/CrewManagementPage';
import ShipManagementPage from '@/pages/ShipManagementPage';
import ShipTypeManagementPage from '@/pages/ShipTypeManagementPage';
import ShipFlagManagementPage from '@/pages/ShipFlagManagementPage';
import CrewDetailPage from '@/pages/CrewDetailPage';
import CrewAssignmentPage from '@/pages/CrewAssignmentPage';
import JobPostingsPage from '@/pages/JobPostingsPage';
import CrewRecommendationsPage from '@/pages/CrewRecommendationsPage';
import MyRecommendationsPage from '@/pages/MyRecommendationsPage';
import RecommendationReviewPage from '@/pages/RecommendationReviewPage';
import ApprovalLineManagementPage from '@/pages/ApprovalLineManagementPage';
import ApprovalInboxPage from '@/pages/ApprovalInboxPage';
import ApprovalManagementPage from '@/pages/ApprovalManagementPage';
import SupervisorManagementPage from '@/pages/SupervisorManagementPage';
import RanksPage from '@/pages/RanksPage';
import PermissionsPage from '@/pages/PermissionsPage';
import SalaryComponentsPage from '@/pages/SalaryComponentsPage';
import SalaryTemplatesPage from '@/pages/SalaryTemplatesPage';
import TemplateAssignmentsPage from '@/pages/TemplateAssignmentsPage';
import ShorePositionsPage from '@/pages/ShorePositionsPage';
import ProfilePage from '@/pages/ProfilePage';
import CompanyManagementPage from '@/pages/CompanyManagementPage';
import UserGroupManagementPage from '@/pages/UserGroupManagementPage';
import ManagerAssignmentPage from '@/pages/ManagerAssignmentPage';
import NationalityManagementPage from '@/pages/NationalityManagementPage';
import CertificateTypeManagementPage from '@/pages/CertificateTypeManagementPage';
import MenuConfigurationPage from '@/pages/MenuConfigurationPage';
import { CrewRotationPage } from '@/pages/CrewRotationPage';
import CrewInputPage from '@/pages/CrewInputPage';
import AuthCallback from '@/pages/AuthCallback';
import NotFound from '@/pages/NotFound';
import { Toaster } from '@/components/ui/toaster';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/crew" element={<CrewManagementPage />} />
        <Route path="/crew/management" element={<CrewManagementPage />} />
        <Route path="/crew/input" element={<CrewInputPage />} />
        <Route path="/crew/new" element={<CrewDetailPage />} />
        <Route path="/crew/:id" element={<CrewDetailPage />} />
        <Route path="/assignments" element={<CrewAssignmentPage />} />
        <Route path="/ships" element={<ShipManagementPage />} />
        <Route path="/ship-types" element={<ShipTypeManagementPage />} />
        <Route path="/ship-flags" element={<ShipFlagManagementPage />} />
        <Route path="/job-postings" element={<JobPostingsPage />} />
        <Route path="/crew-recommendations" element={<CrewRecommendationsPage />} />
        <Route path="/my-recommendations" element={<MyRecommendationsPage />} />
        <Route path="/recommendation-review" element={<RecommendationReviewPage />} />
        <Route path="/approval-lines" element={<ApprovalLineManagementPage />} />
        <Route path="/approval-inbox" element={<ApprovalInboxPage />} />
        <Route path="/approval-management" element={<ApprovalManagementPage />} />
        <Route path="/supervisor-management" element={<SupervisorManagementPage />} />
        <Route path="/ranks" element={<RanksPage />} />
        <Route path="/permissions" element={<PermissionsPage />} />
        <Route path="/salary-components" element={<SalaryComponentsPage />} />
        <Route path="/salary/templates" element={<SalaryTemplatesPage />} />
        <Route path="/salary/assignments" element={<TemplateAssignmentsPage />} />
        <Route path="/shore-positions" element={<ShorePositionsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/companies" element={<CompanyManagementPage />} />
        <Route path="/user-groups" element={<UserGroupManagementPage />} />
        <Route path="/manager-assignments" element={<ManagerAssignmentPage />} />
        <Route path="/nationalities" element={<NationalityManagementPage />} />
        <Route path="/certificate-types" element={<CertificateTypeManagementPage />} />
        <Route path="/menu-configuration" element={<MenuConfigurationPage />} />
        <Route path="/crew-rotation" element={<CrewRotationPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <Toaster />
    </Router>
  );
}

export default App;