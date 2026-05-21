import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { addSeaServiceRecord, updateSeaServiceRecord } from '@/services/crew-extended.service';
import type { SeaServiceRecord } from '@/types/crew-extended';
import { useToast } from '@/hooks/use-toast';

interface SeaServiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  crewId: string;
  record?: SeaServiceRecord;
  onSuccess: () => void;
}

export default function SeaServiceDialog({
  open,
  onOpenChange,
  crewId,
  record,
  onSuccess,
}: SeaServiceDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    record_type: 'pre_company' as 'pre_company' | 'company_assignment',
    ship_name: '',
    ship_type: '',
    flag: '',
    gross_tonnage: '',
    engine_power: '',
    rank: '',
    sign_on_date: '',
    sign_off_date: '',
    sign_off_reason: '',
    port_of_sign_on: '',
    port_of_sign_off: '',
    notes: '',
  });

  useEffect(() => {
    if (record) {
      setFormData({
        record_type: record.record_type,
        ship_name: record.ship_name,
        ship_type: record.ship_type || '',
        flag: record.flag || '',
        gross_tonnage: record.gross_tonnage?.toString() || '',
        engine_power: record.engine_power?.toString() || '',
        rank: record.rank,
        sign_on_date: record.sign_on_date,
        sign_off_date: record.sign_off_date || '',
        sign_off_reason: record.sign_off_reason || '',
        port_of_sign_on: record.port_of_sign_on || '',
        port_of_sign_off: record.port_of_sign_off || '',
        notes: record.notes || '',
      });
    } else {
      setFormData({
        record_type: 'pre_company',
        ship_name: '',
        ship_type: '',
        flag: '',
        gross_tonnage: '',
        engine_power: '',
        rank: '',
        sign_on_date: '',
        sign_off_date: '',
        sign_off_reason: '',
        port_of_sign_on: '',
        port_of_sign_off: '',
        notes: '',
      });
    }
  }, [record, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const recordData = {
        crew_member_id: crewId,
        record_type: formData.record_type,
        ship_name: formData.ship_name,
        ship_type: formData.ship_type || undefined,
        flag: formData.flag || undefined,
        gross_tonnage: formData.gross_tonnage ? parseFloat(formData.gross_tonnage) : undefined,
        engine_power: formData.engine_power ? parseFloat(formData.engine_power) : undefined,
        rank: formData.rank,
        sign_on_date: formData.sign_on_date,
        sign_off_date: formData.sign_off_date || undefined,
        sign_off_reason: formData.sign_off_reason || undefined,
        port_of_sign_on: formData.port_of_sign_on || undefined,
        port_of_sign_off: formData.port_of_sign_off || undefined,
        notes: formData.notes || undefined,
      };

      if (record) {
        await updateSeaServiceRecord(record.id, recordData);
        toast({
          title: '수정 완료',
          description: '승선 기록이 수정되었습니다.',
        });
      } else {
        await addSeaServiceRecord(recordData);
        toast({
          title: '추가 완료',
          description: '승선 기록이 추가되었습니다.',
        });
      }

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving sea service record:', error);
      toast({
        title: '저장 실패',
        description: '승선 기록 저장 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            {record ? '승선 기록 수정' : '승선 기록 추가'}
          </DialogTitle>
          <DialogDescription className="text-xs">
            선원의 승선 이력을 {record ? '수정' : '등록'}합니다
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-3 py-3">
            <div className="space-y-1.5">
              <Label htmlFor="record_type" className="text-xs">기록 유형 *</Label>
              <Select
                value={formData.record_type}
                onValueChange={(value: 'pre_company' | 'company_assignment') => 
                  setFormData({ ...formData, record_type: value })
                }
                required
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="기록 유형 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pre_company" className="text-sm">입사 전 경력</SelectItem>
                  <SelectItem value="company_assignment" className="text-sm">회사 배치</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ship_name" className="text-xs">선박명 *</Label>
                <Input
                  id="ship_name"
                  value={formData.ship_name}
                  onChange={(e) => setFormData({ ...formData, ship_name: e.target.value })}
                  placeholder="선박명을 입력하세요"
                  required
                  className="h-9 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ship_type" className="text-xs">선종</Label>
                <Input
                  id="ship_type"
                  value={formData.ship_type}
                  onChange={(e) => setFormData({ ...formData, ship_type: e.target.value })}
                  placeholder="예: Tanker, Bulk Carrier"
                  className="h-9 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="flag" className="text-xs">국적</Label>
                <Input
                  id="flag"
                  value={formData.flag}
                  onChange={(e) => setFormData({ ...formData, flag: e.target.value })}
                  placeholder="선박 국적"
                  className="h-9 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rank" className="text-xs">직급 *</Label>
                <Input
                  id="rank"
                  value={formData.rank}
                  onChange={(e) => setFormData({ ...formData, rank: e.target.value })}
                  placeholder="승선 시 직급"
                  required
                  className="h-9 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="gross_tonnage" className="text-xs">총톤수 (GT)</Label>
                <Input
                  id="gross_tonnage"
                  type="number"
                  value={formData.gross_tonnage}
                  onChange={(e) => setFormData({ ...formData, gross_tonnage: e.target.value })}
                  placeholder="총톤수"
                  className="h-9 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="engine_power" className="text-xs">주기관 출력 (KW)</Label>
                <Input
                  id="engine_power"
                  type="number"
                  value={formData.engine_power}
                  onChange={(e) => setFormData({ ...formData, engine_power: e.target.value })}
                  placeholder="주기관 출력"
                  className="h-9 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sign_on_date" className="text-xs">승선일 *</Label>
                <Input
                  id="sign_on_date"
                  type="date"
                  value={formData.sign_on_date}
                  onChange={(e) => setFormData({ ...formData, sign_on_date: e.target.value })}
                  required
                  className="h-9 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sign_off_date" className="text-xs">하선일</Label>
                <Input
                  id="sign_off_date"
                  type="date"
                  value={formData.sign_off_date}
                  onChange={(e) => setFormData({ ...formData, sign_off_date: e.target.value })}
                  className="h-9 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="port_of_sign_on" className="text-xs">승선 항구</Label>
                <Input
                  id="port_of_sign_on"
                  value={formData.port_of_sign_on}
                  onChange={(e) => setFormData({ ...formData, port_of_sign_on: e.target.value })}
                  placeholder="예: Busan, Korea"
                  className="h-9 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="port_of_sign_off" className="text-xs">하선 항구</Label>
                <Input
                  id="port_of_sign_off"
                  value={formData.port_of_sign_off}
                  onChange={(e) => setFormData({ ...formData, port_of_sign_off: e.target.value })}
                  placeholder="예: Singapore"
                  className="h-9 text-sm"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sign_off_reason" className="text-xs">하선 사유</Label>
              <Input
                id="sign_off_reason"
                value={formData.sign_off_reason}
                onChange={(e) => setFormData({ ...formData, sign_off_reason: e.target.value })}
                placeholder="예: 계약 만료, 개인 사정"
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes" className="text-xs">비고</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="추가 정보를 입력하세요"
                rows={3}
                className="text-sm resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              className="h-8"
            >
              취소
            </Button>
            <Button 
              type="submit" 
              size="sm" 
              className="h-8"
              disabled={loading}
            >
              {loading ? '저장 중...' : (record ? '수정' : '추가')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}