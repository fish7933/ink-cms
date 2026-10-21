import { Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import en from '@/i18n/locales/components/UrgentBadge/en.json';

i18n.addResourceBundle('en', 'UrgentBadge', en, true, true);

export function UrgentBadge({ className = '' }: { className?: string }) {
  const { t } = useTranslation('UrgentBadge');
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold text-white animate-urgent-flash ${className}`}
    >
      <Zap className="w-3 h-3" />{t('긴급')}
    </span>
  );
}
