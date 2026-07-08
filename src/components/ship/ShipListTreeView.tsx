import { useMemo } from 'react';
import { Building2, ChevronRight, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Ship, Company, Fleet } from '@/types/models';
import { groupShips } from '@/lib/ship-grouping';
import type { OnboardCount } from '@/services/ship-onboard-count.service';

interface ShipListTreeViewProps {
  ships: Ship[];
  companies: Company[];
  fleets?: Fleet[];
  onboardCounts?: Map<string, OnboardCount>;
  onEdit: (ship: Ship) => void;
  onDelete: (id: string) => void;
  onToggleActive?: (ship: Ship) => void;
  canEdit?: boolean;
  canDelete?: boolean;
}

// 설정 › 선주 사용자 관리(ManagerAssignmentPage)와 동일한 트리 구조/스타일 —
// 선주사(Card) › 플릿(들여쓰기) › 선박(들여쓰기) 순으로 얇게 나열한다.
function ShipRow({ ship, onboard, onEdit, onDelete, onToggleActive, canEdit, canDelete }: {
  ship: Ship;
  onboard?: OnboardCount;
  onEdit: (ship: Ship) => void;
  onDelete: (id: string) => void;
  onToggleActive?: (ship: Ship) => void;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const isInactive = ship.is_active === false;
  return (
    <div className="border-l-2 border-gray-100 pl-3 ml-3">
      <div
        className={`flex items-center justify-between py-0.5 ${canEdit ? 'cursor-pointer hover:bg-gray-50' : ''}`}
        onClick={canEdit ? () => onEdit(ship) : undefined}
      >
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <ChevronRight className="w-3 h-3 text-gray-300 shrink-0" />
          <span className={`text-xs ${isInactive ? 'text-gray-300' : 'text-gray-500'} truncate`}>{ship.name}</span>
          {isInactive && <Badge variant="outline" className="text-[10px] text-gray-400 border-gray-300">비활성</Badge>}
          {ship.ship_type && <span className="text-xs text-gray-400">{ship.ship_type}</span>}
          {ship.flag && <span className="text-xs text-gray-400">{ship.flag}</span>}
          {onboard && (onboard.officer > 0 || onboard.rating > 0) && (
            <span className="flex items-center gap-1">
              <Badge variant="secondary" className="text-[10px] bg-indigo-50 text-indigo-700">사관 {onboard.officer}</Badge>
              <Badge variant="secondary" className="text-[10px] bg-teal-50 text-teal-700">부원 {onboard.rating}</Badge>
            </span>
          )}
        </div>
        <div className="flex shrink-0 gap-0.5" onClick={e => e.stopPropagation()}>
          {onToggleActive && (
            <Button
              size="sm" variant="ghost"
              onClick={() => onToggleActive(ship)}
              className={`h-6 px-2 text-xs ${isInactive ? 'text-green-600 hover:text-green-700 hover:bg-green-50' : 'text-gray-400 hover:text-gray-600'}`}
            >
              {isInactive ? '활성화' : '비활성화'}
            </Button>
          )}
          {canEdit && (
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => onEdit(ship)}>
              <Pencil className="w-3 h-3" />
            </Button>
          )}
          {canDelete && (
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-500 hover:text-red-700" onClick={() => onDelete(ship.id)}>
              <Trash2 className="w-3 h-3" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ShipListTreeView({
  ships,
  companies,
  fleets = [],
  onboardCounts = new Map(),
  onEdit,
  onDelete,
  onToggleActive,
  canEdit = true,
  canDelete = true,
}: ShipListTreeViewProps) {
  const groups = useMemo(() => groupShips(ships, companies, fleets), [ships, companies, fleets]);

  if (ships.length === 0) {
    return <div className="rounded-md border py-12 text-center text-sm text-gray-500">등록된 선박이 없습니다</div>;
  }

  return (
    <div className="space-y-3">
      {groups.map(group => {
        const ownerKey = group.owner?.id || '__no_owner__';
        const totalShips = group.ships.length + group.fleetGroups.reduce((sum, f) => sum + f.ships.length, 0);
        return (
          <Card key={ownerKey}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold text-gray-800 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                  {group.owner?.name || '선주사 미지정'}
                </CardTitle>
                <Badge variant="secondary" className="text-xs">{totalShips}척</Badge>
              </div>
            </CardHeader>
            {totalShips > 0 && (
              <CardContent className="pt-0 pb-3">
                <div className="space-y-1 ml-4">
                  {group.fleetGroups.map(fg => (
                    <div key={fg.fleet.id} className="border-l-2 border-gray-200 pl-3">
                      <div className="flex items-center gap-2 py-1">
                        <ChevronRight className="w-3 h-3 text-gray-400 shrink-0" />
                        <Building2 className="w-3 h-3 text-gray-400 shrink-0" />
                        <span className="text-xs font-medium text-gray-600">{fg.fleet.name}</span>
                        <Badge variant="secondary" className="text-xs">{fg.ships.length}척</Badge>
                      </div>
                      {fg.ships.map(ship => (
                        <ShipRow key={ship.id} ship={ship} onboard={onboardCounts.get(ship.id)} onEdit={onEdit} onDelete={onDelete} onToggleActive={onToggleActive} canEdit={canEdit} canDelete={canDelete} />
                      ))}
                    </div>
                  ))}
                  {group.ships.map(ship => (
                    <ShipRow key={ship.id} ship={ship} onboard={onboardCounts.get(ship.id)} onEdit={onEdit} onDelete={onDelete} onToggleActive={onToggleActive} canEdit={canEdit} canDelete={canDelete} />
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
