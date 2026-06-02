import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

export interface Tab {
  id: string;
  title: string;
  path: string;
}

interface TabContextValue {
  tabs: Tab[];
  activeTabId: string | null;
  openTab: (path: string, title: string) => void;
  closeTab: (id: string) => void;
  activateTab: (id: string) => void;
}

const TabContext = createContext<TabContextValue | null>(null);

export function TabProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  // 브라우저 뒤로/앞으로 이동 시 활성 탭 동기화
  useEffect(() => {
    const fullPath = location.pathname + location.search;
    setTabs(current => {
      const tab = current.find(t => t.id === fullPath);
      if (tab) setActiveTabId(fullPath);
      return current;
    });
  }, [location.pathname, location.search]);

  const openTab = useCallback((path: string, title: string) => {
    setTabs(prev => {
      const existing = prev.find(t => t.id === path);
      if (existing) {
        setActiveTabId(path);
        navigate(path);
        return prev;
      }
      setActiveTabId(path);
      navigate(path);
      return [...prev, { id: path, title, path }];
    });
  }, [navigate]);

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
    <TabContext.Provider value={{ tabs, activeTabId, openTab, closeTab, activateTab }}>
      {children}
    </TabContext.Provider>
  );
}

const noopTab: TabContextValue = {
  tabs: [],
  activeTabId: null,
  openTab: () => {},
  closeTab: () => {},
  activateTab: () => {},
};

export function useTabContext() {
  return useContext(TabContext) ?? noopTab;
}
