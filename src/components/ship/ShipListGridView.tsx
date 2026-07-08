import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Ship, Company, Fleet } from '@/types/models';
import type { SalaryTemplate } from '@/lib/salary-store';
import type { OnboardCount } from '@/services/ship-onboard-count.service';
import SalaryTemplateViewDialog from '@/components/salary/SalaryTemplateViewDialog';

interface ShipListGridViewProps {
  ships: Ship[];
  companies: Company[];
  fleets?: Fleet[];
  shipTemplateMap?: Record<string, SalaryTemplate | null>;
  onboardCounts?: Map<string, OnboardCount>;
  onEdit: (ship: Ship) => void;
  onDelete: (id: string) => void;
  onToggleActive?: (ship: Ship) => void;
  canEdit?: boolean;
  canDelete?: boolean;
  selectedShips?: string[];
  onSelectionChange?: (selectedIds: string[]) => void;
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

export default function ShipListGridView({
  ships,
  companies,
  fleets = [],
  shipTemplateMap = {},
  onboardCounts = new Map(),
  onEdit,
  onDelete,
  onToggleActive,
  canEdit = true,
  canDelete = true,
  selectedShips = [],
  onSelectionChange,
}: ShipListGridViewProps) {
  const [viewingTemplateId, setViewingTemplateId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  const ownerNameById = useMemo(() => new Map(companies.map(c => [c.id, c.name])), [companies]);
  const fleetNameById = useMemo(() => new Map(fleets.map(f => [f.id, f.name])), [fleets]);

  // 선주사 > 플릿 > 선박명 순으로 정렬 (미지정은 뒤로)
  const sortedShips = useMemo(() => {
    return [...ships].sort((a, b) => {
      const ownerA = a.owner_id ? (ownerNameById.get(a.owner_id) || '') : '';
      const ownerB = b.owner_id ? (ownerNameById.get(b.owner_id) || '') : '';
      if (ownerA !== ownerB) {
        if (!ownerA) return 1;
        if (!ownerB) return -1;
        return ownerA.localeCompare(ownerB, 'ko');
      }
      const fleetA = a.fleet_id ? (fleetNameById.get(a.fleet_id) || '') : '';
      const fleetB = b.fleet_id ? (fleetNameById.get(b.fleet_id) || '') : '';
      if (fleetA !== fleetB) {
        if (!fleetA) return 1;
        if (!fleetB) return -1;
        return fleetA.localeCompare(fleetB, 'ko');
      }
      return a.name.localeCompare(b.name, 'ko');
    });
  }, [ships, ownerNameById, fleetNameById]);

  const totalPages = Math.max(1, Math.ceil(sortedShips.length / itemsPerPage));
  const currentPageClamped = Math.min(currentPage, totalPages);
  const pagedShips = useMemo(
    () => sortedShips.slice((currentPageClamped - 1) * itemsPerPage, currentPageClamped * itemsPerPage),
    [sortedShips, currentPageClamped, itemsPerPage]
  );
  const goToPage = (p: number) => setCurrentPage(Math.max(1, Math.min(p, totalPages)));

  const showCheckboxes = canDelete && !!onSelectionChange;
  const allSelected = pagedShips.length > 0 && pagedShips.every(s => selectedShips.includes(s.id));
  const someSelected = pagedShips.some(s => selectedShips.includes(s.id));

  const toggleSelectAll = (checked: boolean) => {
    if (!onSelectionChange) return;
    const pageIds = new Set(pagedShips.map(s => s.id));
    onSelectionChange(checked
      ? [...new Set([...selectedShips, ...pageIds])]
      : selectedShips.filter(id => !pageIds.has(id)));
  };

  const toggleSelect = (shipId: string) => {
    if (!onSelectionChange) return;
    onSelectionChange(selectedShips.includes(shipId) ? selectedShips.filter(id => id !== shipId) : [...selectedShips, shipId]);
  };

  if (sortedShips.length === 0) {
    return <div className="rounded-md border py-12 text-center text-sm text-gray-500">등록된 선박이 없습니다</div>;
  }

  return (
    <>
      <div className="flex justify-end items-center gap-2 mb-2">
        <Label className="text-xs">페이지당:</Label>
        <Select value={itemsPerPage.toString()} onValueChange={v => { setItemsPerPage(+v); setCurrentPage(1); }}>
          <SelectTrigger className="h-7 w-16 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-md overflow-hidden overflow-x-auto">
        <table className="w-full text-xs whitespace-nowrap">
          <thead className="bg-gray-50 border-b">
            <tr>
              {showCheckboxes && (
                <th className="w-8 px-2 py-1.5">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={checked => toggleSelectAll(!!checked)}
                    className={someSelected && !allSelected ? 'data-[state=checked]:bg-gray-400' : ''}
                    aria-label="현재 페이지 전체 선택"
                  />
                </th>
              )}
              <th className="w-8 px-2 py-1.5 text-center font-medium text-gray-400">#</th>
              <th className="px-2 py-1.5 text-left font-medium text-gray-600">선주사</th>
              <th className="px-2 py-1.5 text-left font-medium text-gray-600">플릿</th>
              <th className="px-2 py-1.5 text-left font-medium text-gray-600">선박명</th>
              <th className="px-2 py-1.5 text-left font-medium text-gray-600">선종</th>
              <th className="px-2 py-1.5 text-left font-medium text-gray-600">선적</th>
              <th className="px-2 py-1.5 text-right font-medium text-gray-600">GT</th>
              <th className="px-2 py-1.5 text-right font-medium text-gray-600">DWT</th>
              <th className="px-2 py-1.5 text-center font-medium text-gray-600">급여</th>
              <th className="px-2 py-1.5 text-center font-medium text-gray-600">승선인원</th>
              <th className="px-2 py-1.5 text-center font-medium text-gray-600">상태</th>
              <th className="px-2 py-1.5"></th>
            </tr>
          </thead>
          <tbody>
            {pagedShips.map((ship, i) => {
              const isInactive = ship.is_active === false;
              const isSelected = selectedShips.includes(ship.id);
              const onboard = onboardCounts.get(ship.id);
              return (
                <tr
                  key={ship.id}
                  className={`border-b hover:bg-gray-50 ${canEdit ? 'cursor-pointer' : ''} ${isInactive ? 'opacity-60' : ''}`}
                  onClick={canEdit ? () => onEdit(ship) : undefined}
                >
                  {showCheckboxes && (
                    <td className="px-2 py-1.5" onClick={e => e.stopPropagation()}>
                      <Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(ship.id)} aria-label={`${ship.name} 선택`} />
                    </td>
                  )}
                  <td className="px-2 py-1.5 text-center text-gray-400">{(currentPageClamped - 1) * itemsPerPage + i + 1}</td>
                  <td className="px-2 py-1.5 text-gray-600">{ship.owner_id ? (ownerNameById.get(ship.owner_id) || '-') : '-'}</td>
                  <td className="px-2 py-1.5 text-gray-600">{ship.fleet_id ? (fleetNameById.get(ship.fleet_id) || '-') : '-'}</td>
                  <td className="px-2 py-1.5 font-medium">{ship.name}</td>
                  <td className="px-2 py-1.5 text-gray-600">{ship.ship_type || '-'}</td>
                  <td className="px-2 py-1.5 text-gray-600">{ship.flag || '-'}</td>
                  <td className="px-2 py-1.5 text-right text-gray-600">{ship.gt != null ? ship.gt.toLocaleString() : '-'}</td>
                  <td className="px-2 py-1.5 text-right text-gray-600">{ship.dwt != null ? ship.dwt.toLocaleString() : '-'}</td>
                  <td className="px-2 py-1.5 text-center" onClick={e => e.stopPropagation()}>
                    {shipTemplateMap[ship.id] ? (
                      <button type="button" onClick={() => setViewingTemplateId(shipTemplateMap[ship.id]!.id)}>
                        <Badge variant="secondary" className="text-[10px] cursor-pointer bg-green-100 text-green-700 hover:bg-green-200">배정됨</Badge>
                      </button>
                    ) : (
                      <Badge variant="outline" className="text-[10px] text-gray-400">미배정</Badge>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    {onboard && (onboard.officer > 0 || onboard.rating > 0) ? (
                      <div className="flex justify-center gap-1">
                        <Badge variant="secondary" className="text-[10px] bg-indigo-50 text-indigo-700">사관 {onboard.officer}</Badge>
                        <Badge variant="secondary" className="text-[10px] bg-teal-50 text-teal-700">부원 {onboard.rating}</Badge>
                      </div>
                    ) : (
                      <span className="text-gray-300">-</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    {isInactive ? (
                      <Badge variant="outline" className="text-[10px] text-gray-400 border-gray-300">비활성</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px] bg-blue-50 text-blue-600">활성</Badge>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right" onClick={e => e.stopPropagation()}>
                    <div className="flex justify-end gap-0.5">
                      {onToggleActive && (
                        <Button
                          size="sm" variant="ghost"
                          onClick={() => onToggleActive(ship)}
                          className={`h-6 px-1.5 text-[11px] ${isInactive ? 'text-green-600 hover:text-green-700 hover:bg-green-50' : 'text-gray-400 hover:text-gray-600'}`}
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
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 pt-3">
          <Button variant="outline" size="sm" onClick={() => goToPage(currentPageClamped - 1)} disabled={currentPageClamped === 1} className="h-8">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            const p = totalPages <= 5 ? i + 1
              : currentPageClamped <= 3 ? i + 1
              : currentPageClamped >= totalPages - 2 ? totalPages - 4 + i
              : currentPageClamped - 2 + i;
            return (
              <Button key={p} variant={currentPageClamped === p ? 'default' : 'outline'} size="sm"
                onClick={() => goToPage(p)} className="h-8 w-8 p-0">{p}</Button>
            );
          })}
          <Button variant="outline" size="sm" onClick={() => goToPage(currentPageClamped + 1)} disabled={currentPageClamped === totalPages} className="h-8">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      <SalaryTemplateViewDialog
        open={viewingTemplateId !== null}
        onOpenChange={open => { if (!open) setViewingTemplateId(null); }}
        templateId={viewingTemplateId}
      />
    </>
  );
}
