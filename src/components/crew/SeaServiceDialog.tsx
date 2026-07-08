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
import { getShipTypes } from '@/services/ship-classification.service';
import { getActiveShipFlags } from '@/services/ship-flag.service';
import { getSignOffReasons } from '@/services/sign-off-reason.service';
import { loadShipSalaryRankMaps, getRankOptionsForShip, getGradeOptionsForShipRank, type ShipSalaryRankMaps } from '@/services/ship-salary-rank.service';
import { getCompanyInfo } from '@/services/company-info.service';
import { supabase } from '@/lib/supabase';
import { sortRanksByDisplayOrder } from '@/lib/rank-order';
import { RANK_GRADE_LABELS } from '@/types/dispatch';
import type { SeaServiceRecord } from '@/types/crew-extended';
import type { ShipType } from '@/types/ship-classification';
import type { ShipFlag } from '@/types/ship-flag';
import type { Rank } from '@/types/models';
import type { SignOffReason } from '@/types/sign-off-reason';
import { useToast } from '@/hooks/use-toast';

interface RegisteredShip {
  id: string;
  name: string;
  owner_id: string;
  fleet_id?: string | null;
}

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
  const [shipTypes, setShipTypes] = useState<ShipType[]>([]);
  const [shipFlags, setShipFlags] = useState<ShipFlag[]>([]);
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [signOffReasons, setSignOffReasons] = useState<SignOffReason[]>([]);
  const [registeredShips, setRegisteredShips] = useState<RegisteredShip[]>([]);
  const [companiesMap, setCompaniesMap] = useState<Map<string, string>>(new Map());
  const [shipManagerCompanyName, setShipManagerCompanyName] = useState('');
  const [crewManningAgencyName, setCrewManningAgencyName] = useState('');
  const [salaryRankMaps, setSalaryRankMaps] = useState<ShipSalaryRankMaps>({ rankOptionsByShip: new Map(), gradesByTemplate: new Map() });

  const [formData, setFormData] = useState({
    record_type: 'pre_company' as 'pre_company' | 'company_assignment',
    ship_id: '',
    ship_name: '',
    ship_type: '',
    flag: '',
    gross_tonnage: '',
    engine_power: '',
    rank: '',
    rank_grade: '',
    sign_on_date: '',
    sign_off_date: '',
    sign_off_reason_id: '',
    owner_company_name: '',
    ship_manager_name: '',
    manning_agency_name: '',
    notes: '',
  });

  useEffect(() => {
    if (!open) return;
    Promise.all([
      getShipTypes(),
      getActiveShipFlags(),
      supabase.from('ranks').select('*'),
      getSignOffReasons(),
      supabase.from('ships').select('id, name, owner_id, fleet_id').order('name'),
      supabase.from('companies').select('id, name, company_type'),
      supabase.from('crew_members').select('manning_agency_id').eq('id', crewId).single(),
      loadShipSalaryRankMaps(),
      getCompanyInfo(),
    ]).then(([types, flags, ranksRes, reasons, shipsRes, companiesRes, crewRes, salaryMaps, companyInfo]) => {
      setShipTypes(types);
      setShipFlags(flags);
      setRanks(sortRanksByDisplayOrder(ranksRes.data || []));
      setSignOffReasons(reasons);
      setRegisteredShips(shipsRes.data || []);
      const cMap = new Map((companiesRes.data || []).map((c: { id: string; name: string }) => [c.id, c.name]));
      setCompaniesMap(cMap);
      setShipManagerCompanyName(companyInfo?.name || '');
      const manningId = (crewRes.data as { manning_agency_id?: string } | null)?.manning_agency_id;
      setCrewManningAgencyName(manningId ? (cMap.get(manningId) || '') : '');
      setSalaryRankMaps(salaryMaps);
    }).catch(console.error);
  }, [open, crewId]);

  useEffect(() => {
    if (record) {
      setFormData({
        record_type: record.record_type,
        ship_id: record.ship_id || '',
        ship_name: record.ship_name,
        ship_type: record.ship_type || '',
        flag: record.flag || '',
        gross_tonnage: record.gross_tonnage?.toString() || '',
        engine_power: record.engine_power?.toString() || '',
        rank: record.rank,
        rank_grade: record.rank_grade || '',
        sign_on_date: record.sign_on_date,
        sign_off_date: record.sign_off_date || '',
        sign_off_reason_id: record.sign_off_reason_id || '',
        owner_company_name: record.owner_company_name || '',
        ship_manager_name: record.ship_manager_name || '',
        manning_agency_name: record.manning_agency_name || '',
        notes: record.notes || '',
      });
    } else {
      setFormData({
        record_type: 'pre_company',
        ship_id: '',
        ship_name: '',
        ship_type: '',
        flag: '',
        gross_tonnage: '',
        engine_power: '',
        rank: '',
        rank_grade: '',
        sign_on_date: '',
        sign_off_date: '',
        sign_off_reason_id: '',
        owner_company_name: '',
        ship_manager_name: '',
        manning_agency_name: '',
        notes: '',
      });
    }
  }, [record, open]);

  // 회사 배치: 실제 등록된 선박을 고르면 선주사/선박관리사/매닝사, 직급/등급 선택지를 실제 데이터에서 채운다
  const handleShipSelect = (shipId: string) => {
    const ship = registeredShips.find(s => s.id === shipId);
    setFormData(prev => ({
      ...prev,
      ship_id: shipId,
      ship_name: ship?.name || '',
      owner_company_name: ship?.owner_id ? (companiesMap.get(ship.owner_id) || '') : '',
      ship_manager_name: shipManagerCompanyName || prev.ship_manager_name,
      manning_agency_name: crewManningAgencyName || prev.manning_agency_name,
      rank: '',
      rank_grade: '',
    }));
  };

  const isCompanyAssignment = formData.record_type === 'company_assignment';
  const rankOptions = isCompanyAssignment && formData.ship_id ? getRankOptionsForShip(salaryRankMaps, formData.ship_id) : ranks;
  const selectedRank = rankOptions.find(r => r.rank_code === formData.rank);
  const gradeOptions = isCompanyAssignment && formData.ship_id
    ? (selectedRank ? getGradeOptionsForShipRank(salaryRankMaps, formData.ship_id, selectedRank.id) : [])
    : Object.keys(RANK_GRADE_LABELS);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const recordData = {
        crew_member_id: crewId,
        record_type: formData.record_type,
        ship_id: formData.ship_id || undefined,
        ship_name: formData.ship_name,
        ship_type: formData.ship_type || undefined,
        flag: formData.flag || undefined,
        gross_tonnage: formData.gross_tonnage ? parseFloat(formData.gross_tonnage) : undefined,
        engine_power: formData.engine_power ? parseFloat(formData.engine_power) : undefined,
        rank: formData.rank,
        rank_grade: formData.rank_grade || undefined,
        sign_on_date: formData.sign_on_date,
        sign_off_date: formData.sign_off_date || undefined,
        sign_off_reason_id: formData.sign_off_reason_id || undefined,
        owner_company_name: formData.owner_company_name || undefined,
        ship_manager_name: formData.ship_manager_name || undefined,
        manning_agency_name: formData.manning_agency_name || undefined,
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
                  setFormData(prev => ({
                    ...prev,
                    record_type: value,
                    ship_manager_name: value === 'company_assignment' ? (shipManagerCompanyName || prev.ship_manager_name) : prev.ship_manager_name,
                  }))
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

            <div className="grid grid-cols-3 gap-3 p-3 bg-gray-50 rounded-md">
              <div className="space-y-1.5">
                <Label htmlFor="owner_company_name" className="text-xs">선주사</Label>
                <Input
                  id="owner_company_name"
                  value={formData.owner_company_name}
                  onChange={(e) => setFormData({ ...formData, owner_company_name: e.target.value })}
                  placeholder="선주사명"
                  readOnly={isCompanyAssignment && !!formData.ship_id}
                  className={`h-9 text-sm ${isCompanyAssignment && formData.ship_id ? 'bg-gray-100' : ''}`}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ship_manager_name" className="text-xs">선박관리사</Label>
                <Input
                  id="ship_manager_name"
                  value={formData.ship_manager_name}
                  onChange={(e) => setFormData({ ...formData, ship_manager_name: e.target.value })}
                  placeholder="선박관리사명"
                  readOnly={isCompanyAssignment}
                  className={`h-9 text-sm ${isCompanyAssignment ? 'bg-gray-100' : ''}`}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="manning_agency_name" className="text-xs">매닝사</Label>
                <Input
                  id="manning_agency_name"
                  value={formData.manning_agency_name}
                  onChange={(e) => setFormData({ ...formData, manning_agency_name: e.target.value })}
                  placeholder="매닝사명"
                  className="h-9 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ship_name" className="text-xs">선박명 *</Label>
                {isCompanyAssignment ? (
                  <Select value={formData.ship_id || '_none'} onValueChange={v => v !== '_none' && handleShipSelect(v)}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="선박 선택" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none" className="text-sm">선박 선택</SelectItem>
                      {registeredShips.map(s => (
                        <SelectItem key={s.id} value={s.id} className="text-sm">{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id="ship_name"
                    value={formData.ship_name}
                    onChange={(e) => setFormData({ ...formData, ship_name: e.target.value })}
                    placeholder="선박명을 입력하세요"
                    required
                    className="h-9 text-sm"
                  />
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ship_type" className="text-xs">선종</Label>
                <Select value={formData.ship_type || '_none'} onValueChange={v => setFormData({ ...formData, ship_type: v === '_none' ? '' : v })}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="선종 선택" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none" className="text-sm">선택 안함</SelectItem>
                    {shipTypes.map(t => (
                      <SelectItem key={t.id} value={t.name_ko || t.name} className="text-sm">{t.name_ko || t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="flag" className="text-xs">국적(선적)</Label>
                <Select value={formData.flag || '_none'} onValueChange={v => setFormData({ ...formData, flag: v === '_none' ? '' : v })}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="선적 국가 선택" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none" className="text-sm">선택 안함</SelectItem>
                    {shipFlags.map(f => (
                      <SelectItem key={f.id} value={f.name_ko} className="text-sm">{f.name_ko} ({f.code})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rank" className="text-xs">직급 * {isCompanyAssignment && <span className="text-gray-400 font-normal">(급여템플릿 등록 직급만)</span>}</Label>
                <Select
                  value={formData.rank || '_none'}
                  onValueChange={v => setFormData({ ...formData, rank: v === '_none' ? '' : v, rank_grade: '' })}
                  required
                  disabled={isCompanyAssignment && !!formData.ship_id && rankOptions.length === 0}
                >
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="직급 선택" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none" className="text-sm">선택 안함</SelectItem>
                    {rankOptions.map(r => (
                      <SelectItem key={r.id} value={r.rank_code} className="text-sm">{r.rank_code}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isCompanyAssignment && formData.ship_id && rankOptions.length === 0 && (
                  <p className="text-xs text-red-500">이 선박에 배정된 급여템플릿이 없어 직급을 선택할 수 없습니다.</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rank_grade" className="text-xs">등급 (Grade) {isCompanyAssignment && <span className="text-gray-400 font-normal">(급여템플릿 등록 등급만)</span>}</Label>
                <Select value={formData.rank_grade || '_none'} onValueChange={v => setFormData({ ...formData, rank_grade: v === '_none' ? '' : v })} disabled={isCompanyAssignment && gradeOptions.length === 0}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Grade 선택" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none" className="text-sm">Grade 없음</SelectItem>
                    {gradeOptions.map(g => (
                      <SelectItem key={g} value={g} className="text-sm">{g}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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

            <div className="space-y-1.5">
              <Label htmlFor="sign_off_reason" className="text-xs">하선 사유</Label>
              <Select value={formData.sign_off_reason_id || '_none'} onValueChange={v => setFormData({ ...formData, sign_off_reason_id: v === '_none' ? '' : v })}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="하선 사유 선택" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none" className="text-sm">선택 안함</SelectItem>
                  {signOffReasons.map(r => (
                    <SelectItem key={r.id} value={r.id} className="text-sm">{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
