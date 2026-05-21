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
import type { ShipType } from '@/types/ship-classification';
import { SHIP_CATEGORIES, CATEGORY_COLORS } from '@/types/ship-classification';

interface ShipTypeTableProps {
  shipTypes: ShipType[];
  onEdit: (shipType: ShipType) => void;
  onDelete: (id: string) => void;
  canEdit?: boolean;
  canDelete?: boolean;
}

export default function ShipTypeTable({
  shipTypes,
  onEdit,
  onDelete,
  canEdit = true,
  canDelete = true,
}: ShipTypeTableProps) {
  const showActions = canEdit || canDelete;
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  const filteredShipTypes = shipTypes.filter((st) => {
    const matchesSearch =
      !searchTerm ||
      st.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      st.name_ko.includes(searchTerm) ||
      (st.description || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || st.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Get unique categories from actual data
  const uniqueCategories = Array.from(new Set(shipTypes.map((st) => st.category))).sort();

  if (shipTypes.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-gray-500">
        등록된 선종이 없습니다
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="선종명 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-8 text-sm pl-8"
          />
        </div>
        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="h-8 text-sm w-[160px]">
            <SelectValue placeholder="카테고리 필터" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-sm">전체 카테고리</SelectItem>
            {uniqueCategories.map((cat) => {
              const catInfo = SHIP_CATEGORIES.find((c) => c.value === cat);
              return (
                <SelectItem key={cat} value={cat} className="text-sm">
                  {catInfo?.label || cat}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        <span className="text-xs text-gray-500 ml-auto">
          {filteredShipTypes.length} / {shipTypes.length}건
        </span>
      </div>

      {/* Table */}
      <div className="rounded-md border max-h-[500px] overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs w-[50px]">No.</TableHead>
              <TableHead className="text-xs">선종명 (영문)</TableHead>
              <TableHead className="text-xs">선종명 (한글)</TableHead>
              <TableHead className="text-xs">카테고리</TableHead>
              <TableHead className="text-xs">설명</TableHead>
              {showActions && <TableHead className="text-right text-xs w-24">작업</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredShipTypes.map((shipType, index) => (
              <TableRow key={shipType.id}>
                <TableCell className="text-xs text-gray-500">{index + 1}</TableCell>
                <TableCell className="font-medium text-sm">{shipType.name}</TableCell>
                <TableCell className="text-sm">{shipType.name_ko}</TableCell>
                <TableCell>
                  <Badge className={`${CATEGORY_COLORS[shipType.category] || 'bg-gray-100 text-gray-800'} text-xs`}>
                    {shipType.category}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-gray-600 max-w-[200px] truncate">
                  {shipType.description || '-'}
                </TableCell>
                {showActions && (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {canEdit && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onEdit(shipType)}
                          className="h-7 px-2"
                        >
                          <Pencil className="w-3 h-3" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onDelete(shipType.id)}
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
            {filteredShipTypes.length === 0 && (
              <TableRow>
                <TableCell colSpan={showActions ? 6 : 5} className="text-center py-6 text-sm text-gray-500">
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