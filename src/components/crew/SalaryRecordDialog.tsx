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
import { addCrewSalaryRecord, updateCrewSalaryRecord } from '@/services/crew-extended.service';
import type { CrewSalaryRecord } from '@/types/crew-extended';
import { useToast } from '@/hooks/use-toast';

interface SalaryRecordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  crewId: string;
  record?: CrewSalaryRecord;
  onSuccess: () => void;
}

const CURRENCIES = ['USD', 'KRW', 'EUR', 'JPY', 'SGD', 'PHP', 'IDR', 'INR', 'VND', 'MMK'];

const PAYMENT_METHODS = [
  { value: 'bank_transfer', label: '은행 송금' },
  { value: 'cash', label: '현금' },
  { value: 'check', label: '수표' },
  { value: 'other', label: '기타' },
];

const PAYMENT_STATUSES = [
  { value: 'pending', label: '대기' },
  { value: 'paid', label: '지급 완료' },
  { value: 'cancelled', label: '취소' },
];

export default function SalaryRecordDialog({
  open,
  onOpenChange,
  crewId,
  record,
  onSuccess,
}: SalaryRecordDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    payment_period_start: '',
    payment_period_end: '',
    payment_date: '',
    basic_salary: '',
    overtime_pay: '',
    allowances: '',
    bonuses: '',
    deductions: '',
    tax: '',
    net_salary: '',
    currency: 'USD',
    payment_method: '' as string,
    bank_name: '',
    account_number: '',
    payment_status: 'pending',
    notes: '',
  });

  useEffect(() => {
    if (record) {
      setFormData({
        payment_period_start: record.payment_period_start,
        payment_period_end: record.payment_period_end,
        payment_date: record.payment_date,
        basic_salary: record.basic_salary.toString(),
        overtime_pay: record.overtime_pay?.toString() || '',
        allowances: record.allowances?.toString() || '',
        bonuses: record.bonuses?.toString() || '',
        deductions: record.deductions?.toString() || '',
        tax: record.tax?.toString() || '',
        net_salary: record.net_salary.toString(),
        currency: record.currency,
        payment_method: record.payment_method || '',
        bank_name: record.bank_name || '',
        account_number: record.account_number || '',
        payment_status: record.payment_status,
        notes: record.notes || '',
      });
    } else {
      setFormData({
        payment_period_start: '',
        payment_period_end: '',
        payment_date: '',
        basic_salary: '',
        overtime_pay: '',
        allowances: '',
        bonuses: '',
        deductions: '',
        tax: '',
        net_salary: '',
        currency: 'USD',
        payment_method: '',
        bank_name: '',
        account_number: '',
        payment_status: 'pending',
        notes: '',
      });
    }
  }, [record, open]);

  const calcNet = () => {
    const basic = parseFloat(formData.basic_salary) || 0;
    const overtime = parseFloat(formData.overtime_pay) || 0;
    const allowance = parseFloat(formData.allowances) || 0;
    const bonus = parseFloat(formData.bonuses) || 0;
    const deduction = parseFloat(formData.deductions) || 0;
    const taxAmt = parseFloat(formData.tax) || 0;
    return (basic + overtime + allowance + bonus - deduction - taxAmt).toFixed(2);
  };

  const handleCalcNet = () => {
    setFormData(prev => ({ ...prev, net_salary: calcNet() }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = {
        crew_member_id: crewId,
        payment_period_start: formData.payment_period_start,
        payment_period_end: formData.payment_period_end,
        payment_date: formData.payment_date,
        basic_salary: parseFloat(formData.basic_salary),
        overtime_pay: formData.overtime_pay ? parseFloat(formData.overtime_pay) : undefined,
        allowances: formData.allowances ? parseFloat(formData.allowances) : undefined,
        bonuses: formData.bonuses ? parseFloat(formData.bonuses) : undefined,
        deductions: formData.deductions ? parseFloat(formData.deductions) : undefined,
        tax: formData.tax ? parseFloat(formData.tax) : undefined,
        net_salary: parseFloat(formData.net_salary || calcNet()),
        currency: formData.currency,
        payment_method: (formData.payment_method || undefined) as CrewSalaryRecord['payment_method'],
        bank_name: formData.bank_name || undefined,
        account_number: formData.account_number || undefined,
        payment_status: formData.payment_status as CrewSalaryRecord['payment_status'],
        notes: formData.notes || undefined,
      };

      if (record) {
        await updateCrewSalaryRecord(record.id, data);
        toast({ title: '수정 완료', description: '급여 기록이 수정되었습니다.' });
      } else {
        await addCrewSalaryRecord(data);
        toast({ title: '추가 완료', description: '급여 기록이 추가되었습니다.' });
      }
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      toast({ title: '저장 실패', description: '급여 기록 저장 중 오류가 발생했습니다.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">{record ? '급여 기록 수정' : '급여 기록 추가'}</DialogTitle>
          <DialogDescription className="text-xs">선원의 급여 내역을 {record ? '수정' : '등록'}합니다</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-3 py-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">급여 기간 시작 *</Label>
                <Input type="date" value={formData.payment_period_start} onChange={e => setFormData({ ...formData, payment_period_start: e.target.value })} required className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">급여 기간 종료 *</Label>
                <Input type="date" value={formData.payment_period_end} onChange={e => setFormData({ ...formData, payment_period_end: e.target.value })} required className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">지급일 *</Label>
                <Input type="date" value={formData.payment_date} onChange={e => setFormData({ ...formData, payment_date: e.target.value })} required className="h-9 text-sm" />
              </div>
            </div>

            <div className="border-t pt-3">
              <p className="text-xs font-semibold text-gray-600 mb-2">금액 상세</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">기본급 *</Label>
                  <Input type="number" step="0.01" value={formData.basic_salary} onChange={e => setFormData({ ...formData, basic_salary: e.target.value })} required className="h-9 text-sm" placeholder="0.00" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">초과근무 수당</Label>
                  <Input type="number" step="0.01" value={formData.overtime_pay} onChange={e => setFormData({ ...formData, overtime_pay: e.target.value })} className="h-9 text-sm" placeholder="0.00" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">기타 수당</Label>
                  <Input type="number" step="0.01" value={formData.allowances} onChange={e => setFormData({ ...formData, allowances: e.target.value })} className="h-9 text-sm" placeholder="0.00" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">상여금</Label>
                  <Input type="number" step="0.01" value={formData.bonuses} onChange={e => setFormData({ ...formData, bonuses: e.target.value })} className="h-9 text-sm" placeholder="0.00" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">공제액</Label>
                  <Input type="number" step="0.01" value={formData.deductions} onChange={e => setFormData({ ...formData, deductions: e.target.value })} className="h-9 text-sm" placeholder="0.00" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">세금</Label>
                  <Input type="number" step="0.01" value={formData.tax} onChange={e => setFormData({ ...formData, tax: e.target.value })} className="h-9 text-sm" placeholder="0.00" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 mt-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">통화</Label>
                  <Select value={formData.currency} onValueChange={v => setFormData({ ...formData, currency: v })}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c} className="text-sm">{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">순수령액 *</Label>
                    <button type="button" onClick={handleCalcNet} className="text-xs text-blue-600 hover:underline">자동 계산</button>
                  </div>
                  <Input type="number" step="0.01" value={formData.net_salary} onChange={e => setFormData({ ...formData, net_salary: e.target.value })} required className="h-9 text-sm font-semibold" placeholder="0.00" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">지급 상태</Label>
                  <Select value={formData.payment_status} onValueChange={v => setFormData({ ...formData, payment_status: v })}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>{PAYMENT_STATUSES.map(s => <SelectItem key={s.value} value={s.value} className="text-sm">{s.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="border-t pt-3">
              <p className="text-xs font-semibold text-gray-600 mb-2">지급 방법</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">지급 방법</Label>
                  <Select value={formData.payment_method} onValueChange={v => setFormData({ ...formData, payment_method: v })}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="선택" /></SelectTrigger>
                    <SelectContent>{PAYMENT_METHODS.map(m => <SelectItem key={m.value} value={m.value} className="text-sm">{m.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                {formData.payment_method === 'bank_transfer' && (
                  <>
                    <div className="space-y-1.5">
                      <Label className="text-xs">은행명</Label>
                      <Input value={formData.bank_name} onChange={e => setFormData({ ...formData, bank_name: e.target.value })} className="h-9 text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">계좌번호</Label>
                      <Input value={formData.account_number} onChange={e => setFormData({ ...formData, account_number: e.target.value })} className="h-9 text-sm" />
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">비고</Label>
              <Textarea value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} placeholder="추가 정보" rows={2} className="text-sm resize-none" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" size="sm" variant="outline" onClick={() => onOpenChange(false)} disabled={loading} className="h-8">취소</Button>
            <Button type="submit" size="sm" className="h-8" disabled={loading}>{loading ? '저장 중...' : (record ? '수정' : '추가')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
