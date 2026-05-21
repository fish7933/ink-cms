import { useMemo } from 'react';
import PermissionTreeNode from './PermissionTreeNode';
import type { Permission } from '@/types/permissions';
import { RESOURCES } from '@/types/permissions';

interface PermissionTreeProps {
  permissions: Permission[];
  onPermissionChange: (resource: string, field: keyof Permission, value: boolean) => void;
}

export default function PermissionTree({ permissions, onPermissionChange }: PermissionTreeProps) {
  const getPermission = (resource: string) => {
    return permissions.find(p => p.resource === resource);
  };

  const getResourceState = (resource: string) => {
    const permission = getPermission(resource);
    if (!permission) {
      return { checked: false, indeterminate: false };
    }

    const allChecked = permission.can_view && permission.can_create && permission.can_edit && permission.can_delete;
    const someChecked = permission.can_view || permission.can_create || permission.can_edit || permission.can_delete;
    
    return {
      checked: allChecked,
      indeterminate: someChecked && !allChecked,
    };
  };

  const handleResourceToggle = (resource: string, checked: boolean) => {
    onPermissionChange(resource, 'can_view', checked);
    onPermissionChange(resource, 'can_create', checked);
    onPermissionChange(resource, 'can_edit', checked);
    onPermissionChange(resource, 'can_delete', checked);
  };

  const actionLabels = [
    { key: 'can_view', label: '조회', description: '데이터를 조회할 수 있습니다' },
    { key: 'can_create', label: '추가', description: '새로운 데이터를 생성할 수 있습니다' },
    { key: 'can_edit', label: '수정', description: '기존 데이터를 수정할 수 있습니다' },
    { key: 'can_delete', label: '삭제', description: '데이터를 삭제할 수 있습니다' },
  ];

  return (
    <div className="space-y-2">
      {RESOURCES.map((resource) => {
        const permission = getPermission(resource.id);
        const { checked, indeterminate } = getResourceState(resource.id);

        return (
          <PermissionTreeNode
            key={resource.id}
            label={resource.name}
            description={resource.description}
            checked={checked}
            indeterminate={indeterminate}
            onChange={(checked) => handleResourceToggle(resource.id, checked)}
            level={0}
          >
            <div className="space-y-1">
              {actionLabels.map((action) => (
                <PermissionTreeNode
                  key={action.key}
                  label={action.label}
                  description={action.description}
                  checked={permission?.[action.key as keyof Permission] as boolean ?? false}
                  onChange={(checked) => 
                    onPermissionChange(resource.id, action.key as keyof Permission, checked)
                  }
                  level={1}
                />
              ))}
            </div>
          </PermissionTreeNode>
        );
      })}
    </div>
  );
}