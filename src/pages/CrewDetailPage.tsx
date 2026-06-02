import { useNavigate, useParams } from 'react-router-dom';
import Layout from '@/components/Layout';
import { CrewDetailPanel } from '@/components/crew/CrewDetailPanel';

export default function CrewDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const crewId = id === 'new' ? undefined : id;

  return (
    <Layout>
      <CrewDetailPanel
        id={crewId}
        onBack={() => navigate('/crew/management')}
        onSaved={(savedId) => navigate(`/crew/${savedId}`, { replace: true })}
      />
    </Layout>
  );
}
