import { Zap } from 'lucide-react';

export function UrgentBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold text-white animate-urgent-flash ${className}`}
    >
      <Zap className="w-3 h-3" />긴급
    </span>
  );
}
