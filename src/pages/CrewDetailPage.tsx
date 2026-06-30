import { useNavigate, useParams } from 'react-router-dom';
import { CrewDetailPanel } from '@/components/crew/CrewDetailPanel';
import { useTabContext } from '@/contexts/TabContext';

export default function CrewDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { activeTabId, closeTab, updateTab } = useTabContext();

  const crewId = id === 'new' ? undefined : id;

  return (
    <CrewDetailPanel
      id={crewId}
      onBack={() => {
        if (activeTabId) closeTab(activeTabId);
        else navigate('/crew');
      }}
      onSaved={(savedId) => {
        if (activeTabId) updateTab(activeTabId, { path: `/crew/${savedId}`, title: '선원 정보' });
        navigate(`/crew/${savedId}`, { replace: true });
      }}
    />
  );
}
