import { Badge } from '@/components/ui/badge';
import { CREW_STATUS_LABELS, CREW_STATUS_COLORS, type CrewStatus } from '@/types/crew-status';
import { cn } from '@/lib/utils';

interface CrewStatusBadgeProps {
  status: CrewStatus;
  className?: string;
}

export default function CrewStatusBadge({ status, className }: CrewStatusBadgeProps) {
  return (
    <Badge 
      className={cn(
        CREW_STATUS_COLORS[status],
        'text-white text-xs',
        className
      )}
    >
      {CREW_STATUS_LABELS[status]}
    </Badge>
  );
}