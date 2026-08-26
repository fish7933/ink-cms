import { Checkbox } from '@/components/ui/checkbox';
import { Building2, Layers, Ship as ShipIcon } from 'lucide-react';
import { groupShips } from '@/lib/ship-grouping';
import type { Ship, Company, Fleet } from '@/types/models';

interface OwnerFleetShipCheckTreeProps {
  ships: Ship[];
  companies: Company[];
  fleets: Fleet[];
  selectedShipIds: Set<string>;
  onChange: (ids: Set<string>) => void;
}

// 관리비 계산/청구서 일괄 작성에서 재사용하는 전체 > 선주 > 플릿 > 선박 캐스케이드 체크박스.
// 상위 레벨을 체크하면 그 하위 선박 id 전부가 한 번에 선택/해제된다. 선택 상태는 항상
// "선박 id 집합" 하나로만 관리하고(leaf 기준), 선주 단위 집계가 필요한 화면(청구서 일괄 작성)은
// 호출 측에서 선택된 선박들의 owner_id를 모아 쓴다.
export default function OwnerFleetShipCheckTree({ ships, companies, fleets, selectedShipIds, onChange }: OwnerFleetShipCheckTreeProps) {
  const groups = groupShips(ships, companies, fleets);
  const allShipIds = ships.map(s => s.id);

  const toggleIds = (ids: string[], checked: boolean) => {
    const next = new Set(selectedShipIds);
    if (checked) ids.forEach(id => next.add(id));
    else ids.forEach(id => next.delete(id));
    onChange(next);
  };

  const isAllChecked = (ids: string[]) => ids.length > 0 && ids.every(id => selectedShipIds.has(id));

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
        <Checkbox checked={isAllChecked(allShipIds)} onCheckedChange={checked => toggleIds(allShipIds, !!checked)} />
        전체 선택 ({allShipIds.length}척)
      </label>
      <div className="space-y-1.5 pl-1 border-l-2 border-gray-100">
        {groups.map(group => {
          const ownerShipIds = [...group.ships.map(s => s.id), ...group.fleetGroups.flatMap(fg => fg.ships.map(s => s.id))];
          return (
            <div key={group.owner?.id || 'no-owner'} className="pl-2">
              <label className="flex items-center gap-1.5 text-sm font-medium cursor-pointer py-0.5">
                <Checkbox checked={isAllChecked(ownerShipIds)} onCheckedChange={checked => toggleIds(ownerShipIds, !!checked)} />
                <Building2 className="h-3.5 w-3.5 text-gray-400" />
                {group.owner?.name || '선주 미지정'}
                <span className="text-xs text-gray-400 font-normal">({ownerShipIds.length}척)</span>
              </label>
              <div className="pl-6 space-y-1">
                {group.fleetGroups.map(fg => {
                  const fleetShipIds = fg.ships.map(s => s.id);
                  return (
                    <div key={fg.fleet.id}>
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer py-0.5">
                        <Checkbox checked={isAllChecked(fleetShipIds)} onCheckedChange={checked => toggleIds(fleetShipIds, !!checked)} />
                        <Layers className="h-3 w-3 text-gray-400" />
                        {fg.fleet.name}
                        <span className="text-gray-400">({fleetShipIds.length}척)</span>
                      </label>
                      <div className="pl-6 space-y-0.5">
                        {fg.ships.map(ship => (
                          <label key={ship.id} className="flex items-center gap-1.5 text-xs cursor-pointer py-0.5">
                            <Checkbox checked={selectedShipIds.has(ship.id)} onCheckedChange={checked => toggleIds([ship.id], !!checked)} />
                            <ShipIcon className="h-3 w-3 text-gray-300" />
                            {ship.name}
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {group.ships.map(ship => (
                  <label key={ship.id} className="flex items-center gap-1.5 text-xs cursor-pointer py-0.5">
                    <Checkbox checked={selectedShipIds.has(ship.id)} onCheckedChange={checked => toggleIds([ship.id], !!checked)} />
                    <ShipIcon className="h-3 w-3 text-gray-300" />
                    {ship.name}
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
