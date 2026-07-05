import { useEffect, useMemo, useState } from 'react';
import {
  Building2, Layers, ChevronDown, ChevronRight, Trash2,
  Ship as ShipIcon, Droplet, Package, Container, Users, Anchor,
  Factory, LifeBuoy, Wrench, Sparkles, Fish, Sailboat, Shield,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import type { Ship, Company, Fleet } from '@/types/models';
import { getShipClassification, getShipTypes } from '@/services/ship-classification.service';
import type { ShipSizeClassification, ShipType } from '@/types/ship-classification';
import type { SalaryTemplate } from '@/lib/salary-store';
import SalaryTemplateViewDialog from '@/components/salary/SalaryTemplateViewDialog';

interface ShipTreeProps {
  ships: Ship[];
  companies: Company[];
  fleets?: Fleet[];
  shipTemplateMap?: Record<string, SalaryTemplate | null>;
  onEdit: (ship: Ship) => void;
  onDelete: (id: string) => void;
  canEdit?: boolean;
  canDelete?: boolean;
  selectedShips?: string[];
  onSelectionChange?: (selectedIds: string[]) => void;
}

// 선종 카테고리별 아이콘 — ship_types.category는 예전 영문 값(tanker 등)과
// 최근 한글 값(SHIP_CATEGORIES)이 혼재돼 있어 둘 다 매핑해둔다.
const CATEGORY_ICON: Record<string, { icon: LucideIcon; className: string }> = {
  tanker: { icon: Droplet, className: 'text-blue-600 bg-blue-50' },
  bulk: { icon: Package, className: 'text-amber-700 bg-amber-50' },
  container: { icon: Container, className: 'text-indigo-600 bg-indigo-50' },
  general: { icon: ShipIcon, className: 'text-slate-600 bg-slate-100' },
  passenger: { icon: Users, className: 'text-pink-600 bg-pink-50' },
  other: { icon: Anchor, className: 'text-gray-500 bg-gray-100' },
  '화물선': { icon: Package, className: 'text-amber-700 bg-amber-50' },
  '탱커': { icon: Droplet, className: 'text-blue-600 bg-blue-50' },
  '여객선': { icon: Users, className: 'text-pink-600 bg-pink-50' },
  '해양플랜트': { icon: Factory, className: 'text-purple-700 bg-purple-50' },
  '해양지원선': { icon: LifeBuoy, className: 'text-teal-600 bg-teal-50' },
  '예인선': { icon: Anchor, className: 'text-orange-600 bg-orange-50' },
  '작업선': { icon: Wrench, className: 'text-yellow-700 bg-yellow-50' },
  '특수선': { icon: Sparkles, className: 'text-purple-600 bg-purple-50' },
  '어선': { icon: Fish, className: 'text-cyan-700 bg-cyan-50' },
  '레저선박': { icon: Sailboat, className: 'text-rose-600 bg-rose-50' },
  '관공선': { icon: Shield, className: 'text-emerald-700 bg-emerald-50' },
  '기타선박': { icon: ShipIcon, className: 'text-gray-500 bg-gray-100' },
};
const DEFAULT_ICON = { icon: ShipIcon, className: 'text-slate-500 bg-slate-100' };

interface OwnerGroup {
  owner: Company | null;
  ships: Ship[]; // 선대 미지정 선박
  fleetGroups: { fleet: Fleet; ships: Ship[] }[];
}

function groupShips(ships: Ship[], companies: Company[], fleets: Fleet[]): OwnerGroup[] {
  const ownersById = new Map(companies.map(c => [c.id, c]));
  const groupsByOwner = new Map<string, OwnerGroup>();
  const noOwner: OwnerGroup = { owner: null, ships: [], fleetGroups: [] };

  const getOwnerGroup = (ownerId: string): OwnerGroup => {
    if (!groupsByOwner.has(ownerId)) {
      groupsByOwner.set(ownerId, { owner: ownersById.get(ownerId) || null, ships: [], fleetGroups: [] });
    }
    return groupsByOwner.get(ownerId)!;
  };

  for (const ship of ships) {
    const group = ship.owner_id ? getOwnerGroup(ship.owner_id) : noOwner;
    if (ship.fleet_id) {
      let fg = group.fleetGroups.find(f => f.fleet.id === ship.fleet_id);
      if (!fg) {
        const fleet = fleets.find(f => f.id === ship.fleet_id);
        if (!fleet) { group.ships.push(ship); continue; }
        fg = { fleet, ships: [] };
        group.fleetGroups.push(fg);
      }
      fg.ships.push(ship);
    } else {
      group.ships.push(ship);
    }
  }

  const result = [...groupsByOwner.values()].sort((a, b) => (a.owner?.name || '').localeCompare(b.owner?.name || '', 'ko'));
  for (const g of result) g.fleetGroups.sort((a, b) => a.fleet.name.localeCompare(b.fleet.name, 'ko'));
  if (noOwner.ships.length > 0) result.push(noOwner);
  return result;
}

export default function ShipTree({
  ships,
  companies,
  fleets = [],
  shipTemplateMap = {},
  onEdit,
  onDelete,
  canEdit = true,
  canDelete = true,
  selectedShips = [],
  onSelectionChange,
}: ShipTreeProps) {
  const [classifications, setClassifications] = useState<Record<string, ShipSizeClassification | null>>({});
  const [shipTypes, setShipTypes] = useState<ShipType[]>([]);
  const [viewingTemplateId, setViewingTemplateId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    getShipTypes().then(setShipTypes).catch(console.error);
  }, []);

  useEffect(() => {
    const loadClassifications = async () => {
      const classMap: Record<string, ShipSizeClassification | null> = {};
      for (const ship of ships) {
        if (ship.dwt && ship.gt) {
          classMap[ship.id] = await getShipClassification(ship.dwt, ship.gt, (ship as Ship & { ship_type_id?: string }).ship_type_id);
        }
      }
      setClassifications(classMap);
    };
    if (ships.length > 0) loadClassifications();
  }, [ships]);

  const shipTypesById = useMemo(() => new Map(shipTypes.map(t => [t.id, t])), [shipTypes]);
  const shipTypesByLabel = useMemo(() => {
    const map = new Map<string, ShipType>();
    for (const t of shipTypes) { map.set(t.name, t); map.set(t.name_ko, t); }
    return map;
  }, [shipTypes]);

  const getShipIconInfo = (ship: Ship) => {
    const typeId = (ship as Ship & { ship_type_id?: string }).ship_type_id;
    const st = typeId ? shipTypesById.get(typeId) : (ship.ship_type ? shipTypesByLabel.get(ship.ship_type) : undefined);
    const category = st?.category;
    return (category && CATEGORY_ICON[category]) || DEFAULT_ICON;
  };

  const groups = useMemo(() => groupShips(ships, companies, fleets), [ships, companies, fleets]);

  const toggleCollapse = (key: string) => setCollapsed(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const showCheckboxes = canDelete && !!onSelectionChange;

  const toggleSelect = (shipId: string) => {
    if (!onSelectionChange) return;
    onSelectionChange(selectedShips.includes(shipId) ? selectedShips.filter(id => id !== shipId) : [...selectedShips, shipId]);
  };

  const toggleSelectGroup = (groupShipIds: string[], checked: boolean) => {
    if (!onSelectionChange) return;
    if (checked) {
      const merged = new Set([...selectedShips, ...groupShipIds]);
      onSelectionChange([...merged]);
    } else {
      const excluded = new Set(groupShipIds);
      onSelectionChange(selectedShips.filter(id => !excluded.has(id)));
    }
  };

  const renderShipRow = (ship: Ship) => {
    const { icon: Icon, className } = getShipIconInfo(ship);
    const classification = classifications[ship.id];
    const isSelected = selectedShips.includes(ship.id);
    const isBbchp = (ship as Ship & { is_bbchp?: boolean }).is_bbchp;

    return (
      <div
        key={ship.id}
        className={`flex items-center gap-2.5 py-2 pl-14 pr-2 border-t first:border-t-0 ${canEdit ? 'cursor-pointer hover:bg-muted/50' : ''}`}
        onClick={canEdit ? () => onEdit(ship) : undefined}
      >
        {showCheckboxes && (
          <div onClick={e => e.stopPropagation()}>
            <Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(ship.id)} aria-label={`${ship.name} 선택`} />
          </div>
        )}
        <span className={`shrink-0 w-7 h-7 rounded-md flex items-center justify-center ${className}`}>
          <Icon className="w-4 h-4" />
        </span>
        <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm truncate">{ship.name}</span>
          {ship.ship_type && <Badge variant="outline" className="text-xs">{ship.ship_type}</Badge>}
          {classification && (
            <Badge variant="secondary" className="text-xs">{classification.name_ko || classification.name}</Badge>
          )}
          {ship.flag && <span className="text-xs text-muted-foreground">{ship.flag}</span>}
          {isBbchp && <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700">BBCHP</Badge>}
          {ship.built_year && <span className="text-xs text-muted-foreground">{ship.built_year}년</span>}
          {ship.gt != null && <span className="text-xs text-muted-foreground">GT {ship.gt.toLocaleString()}</span>}
          {ship.dwt != null && <span className="text-xs text-muted-foreground">DWT {ship.dwt.toLocaleString()}</span>}
          {shipTemplateMap[ship.id] ? (
            <button type="button" onClick={e => { e.stopPropagation(); setViewingTemplateId(shipTemplateMap[ship.id]!.id); }}>
              <Badge variant="secondary" className="text-xs cursor-pointer bg-green-100 text-green-700 hover:bg-green-200">급여 배정됨</Badge>
            </button>
          ) : (
            <Badge variant="outline" className="text-xs text-gray-400">급여 미배정</Badge>
          )}
        </div>
        {canDelete && (
          <Button
            size="sm" variant="ghost"
            onClick={e => { e.stopPropagation(); onDelete(ship.id); }}
            className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50 shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    );
  };

  if (ships.length === 0) {
    return <div className="rounded-md border py-12 text-center text-sm text-gray-500">등록된 선박이 없습니다</div>;
  }

  return (
    <div className="rounded-md border divide-y">
      {groups.map(group => {
        const ownerKey = group.owner?.id || '__no_owner__';
        const ownerShipIds = [...group.ships, ...group.fleetGroups.flatMap(f => f.ships)].map(s => s.id);
        const ownerSelectedCount = ownerShipIds.filter(id => selectedShips.includes(id)).length;
        const ownerCollapsed = collapsed.has(ownerKey);

        return (
          <div key={ownerKey}>
            <div className="flex items-center gap-2 py-2.5 pl-3 pr-2 bg-slate-50">
              <button type="button" className="shrink-0" onClick={() => toggleCollapse(ownerKey)}>
                {ownerCollapsed ? <ChevronRight className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </button>
              {showCheckboxes && (
                <Checkbox
                  checked={ownerShipIds.length > 0 && ownerSelectedCount === ownerShipIds.length}
                  onCheckedChange={checked => toggleSelectGroup(ownerShipIds, !!checked)}
                  className={ownerSelectedCount > 0 && ownerSelectedCount < ownerShipIds.length ? 'data-[state=checked]:bg-gray-400' : ''}
                />
              )}
              <span className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center bg-blue-100 text-blue-700">
                <Building2 className="w-4 h-4" />
              </span>
              <span className="font-semibold text-sm">{group.owner?.name || '선주사 미지정'}</span>
              <Badge variant="secondary" className="text-xs">{ownerShipIds.length}척</Badge>
            </div>

            {!ownerCollapsed && (
              <div>
                {group.fleetGroups.map(fg => {
                  const fleetKey = `${ownerKey}::${fg.fleet.id}`;
                  const fleetShipIds = fg.ships.map(s => s.id);
                  const fleetSelectedCount = fleetShipIds.filter(id => selectedShips.includes(id)).length;
                  const fleetCollapsed = collapsed.has(fleetKey);

                  return (
                    <div key={fg.fleet.id}>
                      <div className="flex items-center gap-2 py-2 pl-8 pr-2 bg-slate-50/60 border-t">
                        <button type="button" className="shrink-0" onClick={() => toggleCollapse(fleetKey)}>
                          {fleetCollapsed ? <ChevronRight className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                        </button>
                        {showCheckboxes && (
                          <Checkbox
                            checked={fleetShipIds.length > 0 && fleetSelectedCount === fleetShipIds.length}
                            onCheckedChange={checked => toggleSelectGroup(fleetShipIds, !!checked)}
                            className={fleetSelectedCount > 0 && fleetSelectedCount < fleetShipIds.length ? 'data-[state=checked]:bg-gray-400' : ''}
                          />
                        )}
                        <span className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center bg-violet-100 text-violet-700">
                          <Layers className="w-3.5 h-3.5" />
                        </span>
                        <span className="font-medium text-sm text-gray-700">{fg.fleet.name}</span>
                        <Badge variant="secondary" className="text-xs">{fleetShipIds.length}척</Badge>
                      </div>
                      {!fleetCollapsed && fg.ships.map(renderShipRow)}
                    </div>
                  );
                })}
                {group.ships.map(renderShipRow)}
              </div>
            )}
          </div>
        );
      })}

      <SalaryTemplateViewDialog
        open={viewingTemplateId !== null}
        onOpenChange={open => { if (!open) setViewingTemplateId(null); }}
        templateId={viewingTemplateId}
      />
    </div>
  );
}
