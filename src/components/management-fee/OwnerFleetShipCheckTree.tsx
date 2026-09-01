import { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Building2, Layers, Ship as ShipIcon, ChevronDown, ChevronRight } from 'lucide-react';
import { groupShips } from '@/lib/ship-grouping';
import type { Ship, Company, Fleet } from '@/types/models';

interface OwnerFleetShipCheckTreeProps {
  ships: Ship[];
  companies: Company[];
  fleets: Fleet[];
  selectedShipIds: Set<string>;
  onChange: (ids: Set<string>) => void;
  // 지정하면 이 집합에 속한 선박만 목록/선택 대상에 나온다(예: 청구서 일괄 작성에서는 그 달
  // 관리비 계산이 이미 된 선박만). 생략하면 필터 없이 전부 보여준다(관리비 계산 화면의 빠른
  // 선택처럼 "아직 계산 안 된 선박"을 골라야 하는 화면에서는 지정하지 않는다).
  onlyShipIds?: Set<string>;
}

// 관리비 계산/청구서 일괄 작성에서 재사용하는 전체 > 선주 > 플릿 > 선박 캐스케이드 체크박스.
// 상위 레벨을 체크하면 그 하위 선박 id 전부가 한 번에 선택/해제된다. 선택 상태는 항상
// "선박 id 집합" 하나로만 관리하고(leaf 기준), 선주 단위 집계가 필요한 화면(청구서 일괄 작성)은
// 호출 측에서 선택된 선박들의 owner_id를 모아 쓴다.
//
// 선주별로 한 줄만 보이고(접힘), 선주를 클릭하면 그 선주의 플릿/선박이 펼쳐진다 — 관리 선박이
// 많은 선주라면 기본으로 전부 펼쳐두면 화면이 감당 안 되기 때문. 체크박스 클릭은 펼침과
// 별개로 동작한다(체크만 해도 펼쳐지지 않음).
export default function OwnerFleetShipCheckTree({ ships, companies, fleets, selectedShipIds, onChange, onlyShipIds }: OwnerFleetShipCheckTreeProps) {
  // 비활성화된 선박은 관리비 계산/청구서 작성 대상 선택 목록에 나올 필요가 없다(지금 선원이
  // 타지 않는 배). onlyShipIds가 주어졌으면 그 집합에 속한 선박만 추가로 걸러낸다.
  const activeShips = ships.filter(s => s.is_active !== false && (!onlyShipIds || onlyShipIds.has(s.id)));
  const groups = groupShips(activeShips, companies, fleets);
  const allShipIds = activeShips.map(s => s.id);
  const [expandedOwners, setExpandedOwners] = useState<Set<string>>(new Set());

  const toggleIds = (ids: string[], checked: boolean) => {
    const next = new Set(selectedShipIds);
    if (checked) ids.forEach(id => next.add(id));
    else ids.forEach(id => next.delete(id));
    onChange(next);
  };

  const isAllChecked = (ids: string[]) => ids.length > 0 && ids.every(id => selectedShipIds.has(id));

  const toggleOwnerExpanded = (key: string) => {
    setExpandedOwners(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
        <Checkbox checked={isAllChecked(allShipIds)} onCheckedChange={checked => toggleIds(allShipIds, !!checked)} />
        전체 선택 ({allShipIds.length}척)
      </label>
      <div className="space-y-1.5 pl-1 border-l-2 border-gray-100">
        {groups.map(group => {
          const ownerKey = group.owner?.id || 'no-owner';
          const ownerShipIds = [...group.ships.map(s => s.id), ...group.fleetGroups.flatMap(fg => fg.ships.map(s => s.id))];
          const expanded = expandedOwners.has(ownerKey);
          return (
            <div key={ownerKey} className="pl-2">
              <div className="flex items-center gap-1.5 py-0.5">
                <Checkbox checked={isAllChecked(ownerShipIds)} onCheckedChange={checked => toggleIds(ownerShipIds, !!checked)} />
                <button
                  type="button"
                  onClick={() => toggleOwnerExpanded(ownerKey)}
                  className="flex items-center gap-1.5 text-sm font-medium cursor-pointer hover:text-gray-700"
                >
                  {expanded ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
                  <Building2 className="h-3.5 w-3.5 text-gray-400" />
                  {group.owner?.name || '선주 미지정'}
                  <span className="text-xs text-gray-400 font-normal">({ownerShipIds.length}척)</span>
                </button>
              </div>
              {expanded && (
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
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
