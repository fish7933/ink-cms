import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Pencil, Trash2, Search } from 'lucide-react';
import type { ShipSizeClassification, ShipType } from '@/types/ship-classification';

interface SizeClassificationTableProps {
  classifications: ShipSizeClassification[];
  shipTypes?: ShipType[];
  onEdit: (classification: ShipSizeClassification) => void;
  onDelete: (id: string) => void;
  canEdit?: boolean;
  canDelete?: boolean;
}

export default function SizeClassificationTable({
  classifications,
  shipTypes = [],
  onEdit,
  onDelete,
  canEdit = true,
  canDelete = true,
}: SizeClassificationTableProps) {
  const showActions = canEdit || canDelete;
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedShipType, setSelectedShipType] = useState('all');

  // Build a lookup map for ship type names
  const shipTypeMap = new Map<number, ShipType>();
  shipTypes.forEach((st) => shipTypeMap.set(Number(st.id), st));

  const filteredClassifications = classifications.filter((c) => {
    const matchesSearch =
      !searchTerm ||
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.name_ko.includes(searchTerm) ||
      (c.description || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType =
      selectedShipType === 'all' ||
      (c.ship_type_id != null && String(c.ship_type_id) === selectedShipType);
    return matchesSearch && matchesType;
  });

  // Get unique ship type ids from classifications
  const usedShipTypeIds = Array.from(
    new Set(classifications.filter((c) => c.ship_type_id != null).map((c) => Number(c.ship_type_id)))
  ).sort((a, b) => a - b);

  if (classifications.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-gray-500">
        등록된 크기 분류가 없습니다
      </div>
    );
  }

  const formatRange = (min?: number, max?: number, unit: string = '') => {
    if (min && max) {
      return `${min.toLocaleString()} - ${max.toLocaleString()} ${unit}`;
    } else if (min) {
      return `${min.toLocaleString()}+ ${unit}`;
    } else if (max) {
      return `~${max.toLocaleString()} ${unit}`;
    }
    return '-';
  };

  const getShipTypeName = (shipTypeId?: number) => {
    if (shipTypeId == null) return '-';
    const st = shipTypeMap.get(shipTypeId);
    return st ? `${st.name_ko}` : `-`;
  };

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="분류명 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-8 text-sm pl-8"
          />
        </div>
        <Select value={selectedShipType} onValueChange={setSelectedShipType}>
          <SelectTrigger className="h-8 text-sm w-[200px]">
            <SelectValue placeholder="선종 필터" />
          </SelectTrigger>
          <SelectContent className="max-h-[300px]">
            <SelectItem value="all" className="text-sm">전체 선종</SelectItem>
            {usedShipTypeIds.map((id) => {
              const st = shipTypeMap.get(id);
              return (
                <SelectItem key={id} value={String(id)} className="text-sm">
                  {st ? `${st.name_ko} (${st.name})` : `ID: ${id}`}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        <span className="text-xs text-gray-500 ml-auto">
          {filteredClassifications.length} / {classifications.length}건
        </span>
      </div>

      {/* Table */}
      <div className="rounded-md border max-h-[500px] overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs w-[50px]">No.</TableHead>
              <TableHead className="text-xs">분류명 (영문)</TableHead>
              <TableHead className="text-xs">분류명 (한글)</TableHead>
              <TableHead className="text-xs">소속 선종</TableHead>
              <TableHead className="text-xs">GT 범위</TableHead>
              <TableHead className="text-xs">DWT 범위</TableHead>
              <TableHead className="text-xs">DWT/GT</TableHead>
              <TableHead className="text-xs">설명</TableHead>
              {showActions && <TableHead className="text-right text-xs w-24">작업</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredClassifications.map((classification, index) => (
              <TableRow key={classification.id}>
                <TableCell className="text-xs text-gray-500">{index + 1}</TableCell>
                <TableCell className="font-medium text-sm">{classification.name}</TableCell>
                <TableCell className="text-sm">{classification.name_ko}</TableCell>
                <TableCell className="text-sm">
                  {classification.ship_type_id != null ? (
                    <Badge variant="outline" className="text-xs font-normal">
                      {getShipTypeName(Number(classification.ship_type_id))}
                    </Badge>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </TableCell>
                <TableCell className="text-sm">
                  {formatRange(classification.min_gt, classification.max_gt, 'GT')}
                </TableCell>
                <TableCell className="text-sm">
                  {formatRange(classification.min_dwt, classification.max_dwt, 'DWT')}
                </TableCell>
                <TableCell className="text-sm">
                  {classification.dwt_gt_ratio ? classification.dwt_gt_ratio.toFixed(2) : '-'}
                </TableCell>
                <TableCell className="text-sm text-gray-600 max-w-[150px] truncate">
                  {classification.description || '-'}
                </TableCell>
                {showActions && (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {canEdit && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onEdit(classification)}
                          className="h-7 px-2"
                        >
                          <Pencil className="w-3 h-3" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onDelete(classification.id)}
                          className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
            {filteredClassifications.length === 0 && (
              <TableRow>
                <TableCell colSpan={showActions ? 9 : 8} className="text-center py-6 text-sm text-gray-500">
                  검색 결과가 없습니다
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}