import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Eye, Trash2 } from 'lucide-react';
import type { Ship, Company, Fleet } from '@/types/models';
import { useEffect, useState } from 'react';
import { getShipClassification } from '@/services/ship-classification.service';
import type { ShipSizeClassification } from '@/types/ship-classification';

interface ShipTableProps {
  ships: Ship[];
  companies: Company[];
  fleets?: Fleet[];
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
  onEdit, 
  onDelete,
  canEdit = true,
  canDelete = true,
  selectedShips = [],
  onSelectionChange
}: ShipTableProps) {
  const [classifications, setClassifications] = useState<Record<string, ShipSizeClassification | null>>({});

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

  const showActions = canEdit || canDelete;
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
              {showActions && <TableHead className="text-right text-xs">작업</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell colSpan={showCheckboxes ? 11 : 10} className="text-center py-8 text-sm text-gray-500">
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
            {showActions && <TableHead className="text-right text-xs w-32">작업</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {ships.map((ship) => {
            const classification = classifications[ship.id];
            const isSelected = selectedShips.includes(ship.id);
            
            return (
              <TableRow key={ship.id}>
                {showCheckboxes && (
                  <TableCell>
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
                {showActions && (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {canEdit && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onEdit(ship)}
                          className="h-7 px-2 gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span className="text-xs">상세</span>
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onDelete(ship.id)}
                          className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}