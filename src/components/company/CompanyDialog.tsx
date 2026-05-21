import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getMajorSupplierNationalities } from '@/services/nationality.service';
import { getUsersByRole } from '@/services/user.service';
import { getShipOwnerUsers } from '@/lib/store';
import { getContractPeriodOptions } from '@/utils/contract-period';
import type { Nationality } from '@/types/nationality';
import type { User } from '@/types/models';

interface CompanyFormData {
  name: string;
  type: 'owner' | 'manning';
  country: string;
  contact_person: string;
  email: string;
  phone: string;
  default_officer_contract_months?: number;
  default_rating_contract_months?: number;
  manager_id?: string;
}

interface CompanyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formData: CompanyFormData;
  onFormDataChange: (data: CompanyFormData) => void;
  onSubmit: (e: React.FormEvent) => void;
  isEditing: boolean;
}

export default function CompanyDialog({
  open,
  onOpenChange,
  formData,
  onFormDataChange,
  onSubmit,
  isEditing,
}: CompanyDialogProps) {
  const [nationalities, setNationalities] = useState<Nationality[]>([]);
  const [manningUsers, setManningUsers] = useState<User[]>([]);
  const [shipOwnerUsers, setShipOwnerUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [nationalitiesData, usersData, ownerUsersData] = await Promise.all([
          getMajorSupplierNationalities(),
          getUsersByRole('manning_agency'),
          getShipOwnerUsers(),
        ]);
        setNationalities(nationalitiesData);
        setManningUsers(usersData);
        setShipOwnerUsers(ownerUsersData);
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    };

    if (open) {
      loadData();
    }
  }, [open]);

  const companyTypeLabel = formData.type === 'owner' ? '선주사' : '매닝사';
  const isManningCompany = formData.type === 'manning';
  const contractPeriodOptions = getContractPeriodOptions();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            {isEditing ? `${companyTypeLabel} 수정` : `${companyTypeLabel} 추가`}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {companyTypeLabel} 정보를 입력하세요
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="name" className="text-xs">회사명 *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => onFormDataChange({...formData, name: e.target.value})}
              required
              className="h-9 text-sm"
            />
          </div>

          {/* Manager Selection - For Owner Companies */}
          {!isManningCompany && (
            <div className="space-y-1.5">
              <Label htmlFor="manager" className="text-xs">담당자</Label>
              <Select
                value={formData.manager_id || '__none__'}
                onValueChange={(value) => onFormDataChange({...formData, manager_id: value === '__none__' ? undefined : value})}
                disabled={loading}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="담당자를 선택하세요 (선택사항)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" className="text-sm">
                    담당자 없음
                  </SelectItem>
                  {shipOwnerUsers.length === 0 ? (
                    <div className="px-2 py-3 text-xs text-gray-500 text-center">
                      등록된 선주 사용자가 없습니다
                    </div>
                  ) : (
                    shipOwnerUsers.map((user) => (
                      <SelectItem 
                        key={user.id} 
                        value={user.id}
                        className="text-sm"
                      >
                        {user.username || user.name || user.email}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Only show country, contact_person, and email for manning companies */}
          {isManningCompany && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="country" className="text-xs">국적 (송출국) *</Label>
                <Select
                  value={formData.country}
                  onValueChange={(value) => onFormDataChange({...formData, country: value})}
                  disabled={loading}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="국적을 선택하세요" />
                  </SelectTrigger>
                  <SelectContent>
                    {nationalities.map((nationality) => (
                      <SelectItem 
                        key={nationality.id} 
                        value={nationality.country_name_ko}
                        className="text-sm"
                      >
                        {nationality.country_name_ko} ({nationality.country_code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="contact_person" className="text-xs">담당자 *</Label>
                <Select
                  value={formData.contact_person}
                  onValueChange={(value) => onFormDataChange({...formData, contact_person: value})}
                  disabled={loading}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="담당자를 선택하세요" />
                  </SelectTrigger>
                  <SelectContent>
                    {manningUsers.length === 0 ? (
                      <div className="px-2 py-3 text-xs text-gray-500 text-center">
                        등록된 매닝사 사용자가 없습니다
                      </div>
                    ) : (
                      manningUsers.map((user) => (
                        <SelectItem 
                          key={user.id} 
                          value={user.name}
                          className="text-sm"
                        >
                          {user.name} ({user.email})
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs">이메일</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => onFormDataChange({...formData, email: e.target.value})}
                  className="h-9 text-sm"
                  placeholder="email@example.com"
                />
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="phone" className="text-xs">
              전화번호 {!isManningCompany && '*'}
            </Label>
            <Input
              id="phone"
              value={formData.phone}
              onChange={(e) => onFormDataChange({...formData, phone: e.target.value})}
              required={!isManningCompany}
              className="h-9 text-sm"
              placeholder="전화번호를 입력하세요"
            />
          </div>

          {/* Contract Period Settings - Only for Owner Companies */}
          {!isManningCompany && (
            <>
              <div className="pt-2 border-t">
                <h4 className="text-xs font-medium mb-2">기본 계약기간 설정</h4>
                <p className="text-xs text-gray-500 mb-3">
                  선원의 기본 계약기간을 설정합니다. 플릿 및 선박에서 개별 설정이 가능합니다.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="officer_contract" className="text-xs">사관 계약기간</Label>
                  <Select
                    value={formData.default_officer_contract_months?.toString() || '__none__'}
                    onValueChange={(value) => onFormDataChange({
                      ...formData, 
                      default_officer_contract_months: value === '__none__' ? undefined : parseInt(value)
                    })}
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="선택하세요" />
                    </SelectTrigger>
                    <SelectContent>
                      {contractPeriodOptions.map((option) => (
                        <SelectItem 
                          key={option.value} 
                          value={option.value.toString()}
                          className="text-sm"
                        >
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="rating_contract" className="text-xs">부원 계약기간</Label>
                  <Select
                    value={formData.default_rating_contract_months?.toString() || '__none__'}
                    onValueChange={(value) => onFormDataChange({
                      ...formData, 
                      default_rating_contract_months: value === '__none__' ? undefined : parseInt(value)
                    })}
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="선택하세요" />
                    </SelectTrigger>
                    <SelectContent>
                      {contractPeriodOptions.map((option) => (
                        <SelectItem 
                          key={option.value} 
                          value={option.value.toString()}
                          className="text-sm"
                        >
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          )}

          <div className="flex gap-2 pt-3">
            <Button type="submit" className="flex-1 h-9 text-sm">
              {isEditing ? '수정' : '추가'}
            </Button>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => onOpenChange(false)}
              className="h-9 text-sm"
            >
              취소
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}