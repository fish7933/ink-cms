import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { Permission } from '@/types/permissions';
import { RESOURCES } from '@/types/permissions';

interface PermissionMatrixProps {
  permissions: Permission[];
  onPermissionChange: (resource: string, field: keyof Permission, value: boolean) => void;
}

export default function PermissionMatrix({ permissions, onPermissionChange }: PermissionMatrixProps) {
  const getPermission = (resource: string) => {
    return permissions.find(p => p.resource === resource);
  };

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[200px]">기능</TableHead>
            <TableHead className="w-[300px]">설명</TableHead>
            <TableHead className="text-center">조회</TableHead>
            <TableHead className="text-center">추가</TableHead>
            <TableHead className="text-center">수정</TableHead>
            <TableHead className="text-center">삭제</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {RESOURCES.map((resource) => {
            const permission = getPermission(resource.id);
            return (
              <TableRow key={resource.id}>
                <TableCell className="font-medium">
                  <Badge variant="outline">{resource.name}</Badge>
                </TableCell>
                <TableCell className="text-sm text-gray-600">{resource.description}</TableCell>
                <TableCell className="text-center">
                  <Checkbox
                    checked={permission?.can_view ?? false}
                    onCheckedChange={(checked) =>
                      onPermissionChange(resource.id, 'can_view', checked as boolean)
                    }
                  />
                </TableCell>
                <TableCell className="text-center">
                  <Checkbox
                    checked={permission?.can_create ?? false}
                    onCheckedChange={(checked) =>
                      onPermissionChange(resource.id, 'can_create', checked as boolean)
                    }
                  />
                </TableCell>
                <TableCell className="text-center">
                  <Checkbox
                    checked={permission?.can_edit ?? false}
                    onCheckedChange={(checked) =>
                      onPermissionChange(resource.id, 'can_edit', checked as boolean)
                    }
                  />
                </TableCell>
                <TableCell className="text-center">
                  <Checkbox
                    checked={permission?.can_delete ?? false}
                    onCheckedChange={(checked) =>
                      onPermissionChange(resource.id, 'can_delete', checked as boolean)
                    }
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}