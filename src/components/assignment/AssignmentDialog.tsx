import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getUsers } from '@/services/user.service';
import type { User } from '@/types/models';

interface AssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignmentType: 'owner' | 'fleet' | 'ship';
  entityId: string;
  entityName: string;
  onSubmit: (userId: string, role: string) => Promise<void>;
}

export default function AssignmentDialog({
  open,
  onOpenChange,
  assignmentType,
  entityId,
  entityName,
  onSubmit,
}: AssignmentDialogProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      loadUsers();
    }
  }, [open]);

  const loadUsers = async () => {
    try {
      const data = await getUsers();
      // Filter users who can be assigned (ship_manager, ship_owner, manning_agency)
      const eligibleUsers = data.filter(u => 
        ['ship_manager', 'ship_owner', 'manning_agency'].includes(u.role)
      );
      setUsers(eligibleUsers);
    } catch (error) {
      console.error('Error loading users:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId || !selectedRole) return;

    setLoading(true);
    try {
      await onSubmit(selectedUserId, selectedRole);
      setSelectedUserId('');
      setSelectedRole('');
      onOpenChange(false);
    } catch (error) {
      console.error('Error assigning user:', error);
    } finally {
      setLoading(false);
    }
  };

  const getRoleOptions = () => {
    switch (assignmentType) {
      case 'owner':
        return [
          { value: 'owner_manager', label: '선주사 책임자' },
        ];
      case 'fleet':
        return [
          { value: 'fleet_manager', label: '플릿 책임자' },
        ];
      case 'ship':
        return [
          { value: 'ship_manager', label: '선박 책임자' },
          { value: 'manning_manager', label: '매닝 책임자' },
        ];
      default:
        return [];
    }
  };

  const getTypeLabel = () => {
    switch (assignmentType) {
      case 'owner':
        return '선주사';
      case 'fleet':
        return '플릿';
      case 'ship':
        return '선박';
      default:
        return '';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-base">책임자 임명</DialogTitle>
          <DialogDescription className="text-xs">
            {getTypeLabel()} "{entityName}"에 책임자를 임명하세요
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-3 py-3">
            <div className="space-y-1.5">
              <Label htmlFor="user" className="text-xs">사용자 선택 *</Label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="사용자를 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {users.map(user => (
                    <SelectItem key={user.id} value={String(user.id)} className="text-sm">
                      {user.name} ({user.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="role" className="text-xs">역할 선택 *</Label>
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="역할을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {getRoleOptions().map(option => (
                    <SelectItem key={option.value} value={option.value} className="text-sm">
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" size="sm" className="h-8" disabled={loading || !selectedUserId || !selectedRole}>
              {loading ? '처리 중...' : '임명'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}