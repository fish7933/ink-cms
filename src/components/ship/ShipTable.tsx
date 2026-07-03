import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Trash2 } from 'lucide-react';
import type { Ship, Company, Fleet } from '@/types/models';
import { useEffect, useState } from 'react';
import { getShipClassification } from '@/services/ship-classification.service';
import type { ShipSizeClassification } from '@/types/ship-classification';
import type { SalaryTemplate } from '@/lib/salary-store';
import SalaryTemplateViewDialog from '@/components/salary/SalaryTemplateViewDialog';

interface ShipTableProps {
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

export default function ShipTable({
  ships,
  companies,
  fleets = [],
  shipTemplateMap = {},
  onEdit,
  onDelete,
  canEdit = true,
  canDelete = true,
  selectedShips = [],
  onSelectionChange
}: ShipTableProps) {
  const [classifications, setClassifications] = useState<Record<string, ShipSizeClassification | null>>({});
  const [viewingTemplateId, setViewingTemplateId] = useState<string | null>(null);

  useEffect(() => {
    const loadClassifications = async () => {
      const classMap: Record<string, ShipSizeClassification | null> = {};
      
      for (const ship of ships) {
        if (ship.dwt && ship.gt) {
          const classification = await getShipClassification(
            ship.dwt, 
            ship.gt, 
            ship.ship_type_id
          );
          classMap[ship.id] = classification;
        }
      }
      
      setClassifications(classMap);
    };

    if (ships.length > 0) {
      loadClassifications();
    }
  }, [ships]);

  const getCompanyName = (companyId?: string) => {
    if (!companyId) return '-';
    return companies.find(c => c.id === companyId)?.name || '-';
  };

  const getFleetName = (fleetId?: string) => {
    if (!fleetId) return '-';
    return fleets.find(f => f.id === fleetId)?.name || '-';
  };

  const showActions = canDelete;
  const showCheckboxes = canDelete && onSelectionChange;

  const handleSelectAll = (checked: boolean) => {
    if (!onSelectionChange) return;
    if (checked) {
      onSelectionChange(ships.map(ship => ship.id));
    } else {
      onSelectionChange([]);
    }
  };

  const handleSelectShip = (shipId: string, checked: boolean) => {
    if (!onSelectionChange) return;
    if (checked) {
      onSelectionChange([...selectedShips, shipId]);
    } else {
      onSelectionChange(selectedShips.filter(id => id !== shipId));
    }
  };

  const allSelected = ships.length > 0 && selectedShips.length === ships.length;
  const someSelected = selectedShips.length > 0 && selectedShips.length < ships.length;

  if (ships.length === 0) {
    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {showCheckboxes && <TableHead className="w-12"></TableHead>}
              <TableHead className="text-xs">선주사</TableHead>
              <TableHead className="text-xs">플릿</TableHead>
              <TableHead className="text-xs">선박명</TableHead>
              <TableHead className="text-xs">선종</TableHead>
              <TableHead className="text-xs">분류</TableHead>
              <TableHead className="text-xs">선적국</TableHead>
              <TableHead className="text-xs">건조년도</TableHead>
              <TableHead className="text-xs">GT</TableHead>
              <TableHead className="text-xs">DWT</TableHead>
              <TableHead className="text-xs">급여 템플릿</TableHead>
              {showActions && <TableHead className="text-right text-xs">작업</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell colSpan={showCheckboxes ? 12 : 11} className="text-center py-8 text-sm text-gray-500">
                등록된 선박이 없습니다
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {showCheckboxes && (
              <TableHead className="w-12">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={handleSelectAll}
                  aria-label="전체 선택"
                  className={someSelected ? "data-[state=checked]:bg-gray-400" : ""}
                />
              </TableHead>
            )}
            <TableHead className="text-xs">선주사</TableHead>
            <TableHead className="text-xs">플릿</TableHead>
            <TableHead className="text-xs">선박명</TableHead>
            <TableHead className="text-xs">선종</TableHead>
            <TableHead className="text-xs">분류</TableHead>
            <TableHead className="text-xs">선적국</TableHead>
            <TableHead className="text-xs">건조년도</TableHead>
            <TableHead className="text-xs">GT</TableHead>
            <TableHead className="text-xs">DWT</TableHead>
            <TableHead className="text-xs">급여 템플릿</TableHead>
            {showActions && <TableHead className="text-right text-xs w-32">작업</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {ships.map((ship) => {
            const classification = classifications[ship.id];
            const isSelected = selectedShips.includes(ship.id);
            
            return (
              <TableRow
                key={ship.id}
                className={canEdit ? 'cursor-pointer hover:bg-muted/50' : undefined}
                onClick={canEdit ? () => onEdit(ship) : undefined}
              >
                {showCheckboxes && (
                  <TableCell onClick={e => e.stopPropagation()}>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={(checked) => handleSelectShip(ship.id, checked as boolean)}
                      aria-label={`${ship.name} 선택`}
                    />
                  </TableCell>
                )}
                <TableCell className="text-sm">{getCompanyName(ship.owner_id)}</TableCell>
                <TableCell className="text-sm">
                  {ship.fleet_id ? (
                    <Badge variant="outline" className="text-xs">
                      {getFleetName(ship.fleet_id)}
                    </Badge>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </TableCell>
                <TableCell className="font-medium text-sm">{ship.name}</TableCell>
                <TableCell className="text-sm">{ship.ship_type || '-'}</TableCell>
                <TableCell className="text-sm">
                  {classification ? (
                    <Badge variant="secondary" className="text-xs">
                      {classification.name_ko || classification.name}
                    </Badge>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </TableCell>
                <TableCell className="text-sm">
                  <div className="flex items-center gap-1.5">
                    <span>{ship.flag || '-'}</span>
                    {ship.is_bbchp && (
                      <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700">
                        BBCHP
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-sm">
                  {ship.built_year || ship.year_built || '-'}
                </TableCell>
                <TableCell className="text-sm">
                  {ship.gt ? ship.gt.toLocaleString() : '-'}
                </TableCell>
                <TableCell className="text-sm">
                  {ship.dwt ? ship.dwt.toLocaleString() : '-'}
                </TableCell>
                <TableCell className="text-sm" onClick={e => e.stopPropagation()}>
                  {shipTemplateMap[ship.id] ? (
                    <button type="button" onClick={() => setViewingTemplateId(shipTemplateMap[ship.id]!.id)}>
                      <Badge variant="secondary" className="text-xs cursor-pointer bg-green-100 text-green-700 hover:bg-green-200">배정됨</Badge>
                    </button>
                  ) : (
                    <Badge variant="outline" className="text-xs text-gray-400">미배정</Badge>
                  )}
                </TableCell>
                {canDelete && (
                  <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onDelete(ship.id)}
                      className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <SalaryTemplateViewDialog
        open={viewingTemplateId !== null}
        onOpenChange={open => { if (!open) setViewingTemplateId(null); }}
        templateId={viewingTemplateId}
      />
    </div>
  );
}