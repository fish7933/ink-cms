import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Pencil, Trash2 } from 'lucide-react';
import type { Company, User } from '@/types/models';

interface CompanyTableProps {
  companies: Company[];
  currentUser: User;
  onEdit: (company: Company) => void;
  onDelete?: (company: Company) => void;
  canEdit?: boolean;
  canDelete?: boolean;
}

export default function CompanyTable({ 
  companies, 
  currentUser, 
  onEdit, 
  onDelete,
  canEdit = true, 
  canDelete = true 
}: CompanyTableProps) {
  const showActions = canEdit || canDelete;

  if (companies.length === 0) {
    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">회사명</TableHead>
              <TableHead className="text-xs">국가</TableHead>
              <TableHead className="text-xs">담당자</TableHead>
              <TableHead className="text-xs">연락처</TableHead>
              {showActions && <TableHead className="text-right text-xs">작업</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell colSpan={5} className="text-center py-8 text-sm text-gray-500">
                등록된 회사가 없습니다
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
            <TableHead className="text-xs">회사명</TableHead>
            <TableHead className="text-xs">국가</TableHead>
            <TableHead className="text-xs">담당자</TableHead>
            <TableHead className="text-xs">연락처</TableHead>
            {showActions && <TableHead className="text-right text-xs">작업</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {companies.map((company) => (
            <TableRow key={company.id}>
              <TableCell className="font-medium text-sm">{company.name}</TableCell>
              <TableCell className="text-sm">{company.country}</TableCell>
              <TableCell className="text-sm">{company.contact_person}</TableCell>
              <TableCell>
                <div className="text-sm">
                  <div>{company.email || '-'}</div>
                  <div className="text-gray-500">{company.phone || '-'}</div>
                </div>
              </TableCell>
              {showActions && (
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {canEdit && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onEdit(company)}
                        className="h-7 px-2"
                      >
                        <Pencil className="w-3 h-3" />
                      </Button>
                    )}
                    {canDelete && onDelete && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onDelete(company)}
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
        </TableBody>
      </Table>
    </div>
  );
}