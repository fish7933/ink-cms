import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { CrewDetailPanel } from '@/components/crew/CrewDetailPanel';
import { useTabContext } from '@/contexts/TabContext';
import en from '@/i18n/locales/pages/CrewDetailPage/en.json';
i18n.addResourceBundle('en', 'CrewDetailPage', en, true, true);

export default function CrewDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { activeTabId, tabs, closeTab, updateTab, activateTab, openTab } = useTabContext();
  const { t } = useTranslation('CrewDetailPage');

  const crewId = id === 'new' ? undefined : id;

  return (
    <CrewDetailPanel
      id={crewId}
      onBack={() => {
        if (activeTabId) closeTab(activeTabId);
        else navigate('/crew');
      }}
      onSaved={(savedId, opts) => {
        // 이력서 AI로 등록한 선원은 상세 화면 대신, 방금 등록된 선원이 바로 보이도록 선원
        // 목록의 "등록" 탭으로 보낸다 — 열려 있는 선원 목록 탭이 있으면 그 탭을 재사용.
        if (opts?.viaAi) {
          const existingListTab = tabs.find(tb => tb.path === '/crew' || tb.path.startsWith('/crew?'));
          if (existingListTab) {
            updateTab(existingListTab.id, { path: '/crew?category=registered', title: t('선원 목록') });
            activateTab(existingListTab.id);
          } else {
            openTab('/crew?category=registered', t('선원 목록'));
          }
          if (activeTabId) closeTab(activeTabId);
          return;
        }
        if (activeTabId) updateTab(activeTabId, { path: `/crew/${savedId}`, title: t('선원 정보') });
        navigate(`/crew/${savedId}`, { replace: true });
      }}
    />
  );
}
