import React, { createContext, useContext, useState, useCallback } from 'react';

export interface UISettings {
  tabMaxWidth: number;  // 탭 최대 너비 (px)
  tabMinWidth: number;  // 탭 최소 너비 (px)
  maxOpenTabs: number;  // 최대 탭 개수 (0 = 무제한)
}

export const DEFAULT_UI_SETTINGS: UISettings = {
  tabMaxWidth: 160,
  tabMinWidth: 80,
  maxOpenTabs: 0,
};

const STORAGE_KEY = 'uiSettings';

interface UISettingsContextValue {
  uiSettings: UISettings;
  updateUISettings: (updates: Partial<UISettings>) => void;
  resetUISettings: () => void;
}

const UISettingsContext = createContext<UISettingsContextValue | null>(null);

export function UISettingsProvider({ children }: { children: React.ReactNode }) {
  const [uiSettings, setUISettings] = useState<UISettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? { ...DEFAULT_UI_SETTINGS, ...JSON.parse(saved) } : DEFAULT_UI_SETTINGS;
    } catch {
      return DEFAULT_UI_SETTINGS;
    }
  });

  const updateUISettings = useCallback((updates: Partial<UISettings>) => {
    setUISettings(prev => {
      const next = { ...prev, ...updates };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const resetUISettings = useCallback(() => {
    setUISettings(DEFAULT_UI_SETTINGS);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return (
    <UISettingsContext.Provider value={{ uiSettings, updateUISettings, resetUISettings }}>
      {children}
    </UISettingsContext.Provider>
  );
}

export function useUISettings() {
  const ctx = useContext(UISettingsContext);
  if (!ctx) throw new Error('useUISettings must be used within UISettingsProvider');
  return ctx;
}
