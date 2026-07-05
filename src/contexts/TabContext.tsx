import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useUISettings } from './UISettingsContext';

export interface Tab {
  id: string;
  title: string;
  path: string;
}

interface TabContextValue {
  tabs: Tab[];
  activeTabId: string | null;
  openTab: (path: string, title: string) => void;
  openNewTab: (path: string, title: string, alwaysNew?: boolean) => void;
  closeTab: (id: string) => void;
  closeLastTab: () => void;
  closeAllTabs: () => void;
  updateTab: (id: string, updates: Partial<Pick<Tab, 'path' | 'title'>>) => void;
  activateTab: (id: string) => void;
}

const TabContext = createContext<TabContextValue | null>(null);

const AUTH_PATHS = ['/login', '/auth/callback', '/'];

export function TabProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { uiSettings } = useUISettings();
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    const fullPath = location.pathname + location.search;
    if (!AUTH_PATHS.includes(location.pathname)) {
      initialized.current = true;
      setTabs([{ id: fullPath, title: getTitleFromPath(fullPath), path: fullPath }]);
      setActiveTabId(fullPath);
    }
  }, [location.pathname, location.search]);

  // 메뉴 클릭 등 기존 탭 재사용 방식
  const openTab = useCallback((path: string, title: string) => {
    setTabs(prev => {
      const existing = prev.find(t => t.id === path);
      if (existing) {
        setActiveTabId(path);
        navigate(path);
        return prev;
      }
      const limit = uiSettings.maxOpenTabs;
      if (limit > 0 && prev.length >= limit) return prev;
      setActiveTabId(path);
      navigate(path);
      return [...prev, { id: path, title, path }];
    });
  }, [navigate, uiSettings.maxOpenTabs]);

  // 액션(등록/열람) 전용: 항상 새 탭 또는 같은 경로 재사용
  const openNewTab = useCallback((path: string, title: string, alwaysNew = false) => {
    setTabs(prev => {
      if (!alwaysNew) {
        const existing = prev.find(t => t.path === path);
        if (existing) {
          setActiveTabId(existing.id);
          navigate(path);
          return prev;
        }
      }
      const limit = uiSettings.maxOpenTabs;
      if (limit > 0 && prev.length >= limit) return prev;
      const samePathCount = prev.filter(t => t.path === path).length;
      const tabTitle = samePathCount === 0 ? title : `${title} (${samePathCount + 1})`;
      const id = `${path}:${Date.now()}`;
      setActiveTabId(id);
      navigate(path);
      return [...prev, { id, title: tabTitle, path }];
    });
  }, [navigate, uiSettings.maxOpenTabs]);

  const closeTab = useCallback((id: string) => {
    setTabs(prev => {
      const idx = prev.findIndex(t => t.id === id);
      const newTabs = prev.filter(t => t.id !== id);

      setActiveTabId(currentActive => {
        if (id !== currentActive) return currentActive;
        if (newTabs.length === 0) {
          navigate('/dashboard');
          return null;
        }
        const next = newTabs[Math.max(0, idx - 1)];
        navigate(next.path);
        return next.id;
      });

      return newTabs;
    });
  }, [navigate]);

  // 마지막 탭 닫기 (탭바 끝 버튼)
  const closeLastTab = useCallback(() => {
    setTabs(prev => {
      if (prev.length === 0) return prev;
      const lastTab = prev[prev.length - 1];
      const newTabs = prev.slice(0, -1);
      setActiveTabId(currentActive => {
        if (lastTab.id !== currentActive) return currentActive;
        if (newTabs.length === 0) { navigate('/dashboard'); return null; }
        const newLast = newTabs[newTabs.length - 1];
        navigate(newLast.path);
        return newLast.id;
      });
      return newTabs;
    });
  }, [navigate]);

  // 전체 탭 닫기
  const closeAllTabs = useCallback(() => {
    setTabs([]);
    setActiveTabId(null);
    navigate('/dashboard');
  }, [navigate]);

  // 탭 경로/제목 업데이트 (저장 후 경로 변경 시)
  const updateTab = useCallback((id: string, updates: Partial<Pick<Tab, 'path' | 'title'>>) => {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  }, []);

  const activateTab = useCallback((id: string) => {
    setTabs(current => {
      const tab = current.find(t => t.id === id);
      if (tab) {
        setActiveTabId(id);
        navigate(tab.path);
      }
      return current;
    });
  }, [navigate]);

  return (
    <TabContext.Provider value={{ tabs, activeTabId, openTab, openNewTab, closeTab, closeLastTab, closeAllTabs, updateTab, activateTab }}>
      {children}
    </TabContext.Provider>
  );
}

const noopTab: TabContextValue = {
  tabs: [],
  activeTabId: null,
  openTab: () => {},
  openNewTab: () => {},
  closeTab: () => {},
  closeLastTab: () => {},
  closeAllTabs: () => {},
  updateTab: () => {},
  activateTab: () => {},
};

export function useTabContext() {
  return useContext(TabContext) ?? noopTab;
}

function getTitleFromPath(path: string): string {
  const map: Record<string, string> = {
    '/dashboard': '대시보드',
    '/crew': '선원 목록', '/crew/management': '선원 목록', '/crew/new': '선원 등록', '/crew/input': '선원 고용',
    '/assignments': '발령 관리', '/crew-rotation': '선원 교대 발령',
    '/ships': '선박 목록', '/ship-types': '선종/분류 관리', '/ship-flags': '선적국 관리', '/fleet-management': '플릿 관리',
    '/job-postings': '구인 공고', '/my-recommendations': '내 추천 선원', '/recommendation-review': '추천 검토',
    '/approval-inbox': '내 결재함', '/approval-archive': '완료 문서함', '/approval-management': '결재 캐비넷', '/approval-lines': '결재선 관리',
    '/documents/new': '기안서 작성', '/documents': '기안함', '/document-types': '문서유형/전결규정 관리',
    '/salary/templates': '급여 템플릿', '/salary/templates/new': '급여 템플릿 추가', '/salary-components': '급여 구성항목', '/allotment-management': '송금 관리',
    '/companies': '회사 관리', '/companies?type=owner': '선주사 관리', '/companies?type=manning': '선원 매닝사 관리', '/user-groups': '사용자 그룹', '/manager-assignments': '선주 사용자 관리', '/supervisor-management': '우리회사 담당자 관리',
    '/ranks': '직급 관리', '/nationalities': '선원 국적 관리', '/certificate-types': '증서 유형 관리',
    '/shore-positions': '육상 직원 직급', '/org-chart': '조직도 관리', '/permissions': '권한 관리', '/menu-configuration': 'UI 구성 관리', '/profile': '프로필',
    '/certificate-expiry': '증서 만료 현황', '/leave-management': '휴가 관리', '/reports': '통계 대시보드',
    '/crew-evaluations': '선원 평가', '/contract-management': '계약 관리', '/ports': '교대지 관리',
  };
  if (map[path]) return map[path];
  const basePath = path.split('?')[0];
  if (map[basePath]) return map[basePath];
  if (basePath.match(/^\/crew\/[^/]+\/resume$/)) return '이력서';
  if (basePath.match(/^\/salary\/templates\/[^/]+\/edit$/)) return '급여 템플릿 수정';
  if (basePath.match(/^\/salary\/templates\/[^/]+$/)) return '급여 템플릿 상세';
  if (basePath.match(/^\/crew\/[^/]+$/)) return '선원 정보';
  if (basePath.match(/^\/crew-rotation\/(?!new$)[^/]+$/)) return '교대계획 상세';
  return basePath;
}
