import i18n from '@/i18n';
import en from '@/i18n/locales/components/utils/en.json';
i18n.addResourceBundle('en', 'utils', en, true, true);

// Helper function to format date as YYYY-MM-DD
export const formatDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Helper function to get default embarkation date (1 month from today)
export const getDefaultEmbarkationDate = (): string => {
  const date = new Date();
  date.setMonth(date.getMonth() + 1);
  return formatDate(date);
};

// Helper function to get default application deadline (2 weeks from today)
export const getDefaultApplicationDeadline = (): string => {
  const date = new Date();
  date.setDate(date.getDate() + 14);
  return formatDate(date);
};

export const departmentLabels = {
  deck: i18n.t('갑판부', { ns: 'utils' }),
  engine: i18n.t('기관부', { ns: 'utils' }),
  catering: i18n.t('사주부', { ns: 'utils' }),
};

export const departmentColors = {
  deck: 'bg-blue-100 text-blue-700 border-blue-300',
  engine: 'bg-green-100 text-green-700 border-green-300',
  catering: 'bg-orange-100 text-orange-700 border-orange-300',
};