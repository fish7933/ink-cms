import { useState, useEffect, useRef, useCallback } from 'react';
import { Save, Upload, User, X, Plus, Trash2, FileText, Edit2, Star, Stethoscope } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import { crewService } from '@/services/crew.service';
import { sortRanksByDisplayOrder } from '@/lib/rank-order';
import { crewDisplayName } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useTabContext } from '@/contexts/TabContext';
import { rotationService, type CrewReservation } from '@/services/rotation.service';
import { getNationalities } from '@/services/nationality.service';
import { getCertificateTypes, getAllNationalityValidityOverrides } from '@/services/certificate-type.service';
import { getCertificateCategories } from '@/services/certificate-category.service';
import type { Nationality } from '@/types/nationality';
import type { CertificateType, CertificateNationalityValidity } from '@/types/certificate-type';
import type { CertificateCategory } from '@/types/certificate-category';
import SeaServiceDialog from '@/components/crew/SeaServiceDialog';
import SeaServiceEvaluationDialog from '@/components/crew/SeaServiceEvaluationDialog';
import SeaServiceMedicalDialog from '@/components/crew/SeaServiceMedicalDialog';
import EvaluationDialog from '@/components/crew/EvaluationDialog';
import { getEvaluations, deleteEvaluation } from '@/services/evaluation.service';
import type { CrewEvaluationWithDetails } from '@/types/evaluation';
import TrainingRecordDialog from '@/components/crew/TrainingRecordDialog';
import MedicalRecordDialog from '@/components/crew/MedicalRecordDialog';
import SalaryRecordDialog from '@/components/crew/SalaryRecordDialog';
import CrewInterviewDialog from '@/components/crew/CrewInterviewDialog';
import {
  getSeaServiceRecords, deleteSeaServiceRecord,
  getTrainingRecords, deleteTrainingRecord,
  getMedicalRecords, deleteMedicalRecord,
  getCrewSalaryRecords, deleteCrewSalaryRecord,
  getCrewInterviewLogs, deleteCrewInterviewLog,
} from '@/services/crew-extended.service';
import type { SeaServiceRecord, TrainingRecord, MedicalRecord, CrewSalaryRecord, CrewInterviewLog, CrewInterviewLogWithDetails } from '@/types/crew-extended';
import { crewPayrollService } from '@/services/crew-payroll.service';
import type { CrewPayrollHistoryRow, CrewPayslipWithDetails } from '@/types/crew-payroll';
import CrewPayslipDetailView from '@/components/crew-payroll/CrewPayslipDetailView';
import { sickPayService } from '@/services/sick-pay.service';
import type { CrewSickPayHistoryRow } from '@/types/sick-pay';

const REC_LABELS: Record<string, string> = { highly_recommend: '강력 추천', recommend: '추천', neutral: '보통', not_recommend: '비추천' };

interface EmergencyContact {
  name: string;
  relationship: string;
  phone: string;
  note?: string;
}

interface Certificate {
  name: string;
  number?: string;
  issued_date?: string;
  expiry_date?: string;
  issuing_authority?: string;
  no_expiry?: boolean;
  file_path?: string;
  file_name?: string;
}

interface Rank {
  id: string;
  name: string;
  rank_code: string;
  rank_category: 'officer' | 'rating';
}

interface CrewDetailPanelProps {
  id?: string;
  onBack: () => void;
  onSaved: (id: string) => void;
  embedded?: boolean;
}

const RELATIONSHIPS = ['배우자', '부', '모', '자', '녀', '형', '제', '자매', '친구', '기타'];
const SHOE_SIZES = ['235','240','245','250','255','260','265','270','275','280','285','290','295','300'];
const COVERALL_SIZES = ['XS','S','M','L','XL','XXL','XXXL'];
const EYE_COLORS = ['검정', '갈색', '파랑', '녹색', '회색', '기타'];
const RELIGIONS = ['기독교', '천주교', '불교', '이슬람', '힌두교', '무교', '기타'];
const MARITAL_STATUSES = [
  { value: 'single', label: '미혼' },
  { value: 'married', label: '기혼' },
  { value: 'divorced', label: '이혼' },
  { value: 'widowed', label: '사별' },
];
const ENGLISH_LEVELS = [
  { value: 'beginner', label: '초급' },
  { value: 'intermediate', label: '중급' },
  { value: 'advanced', label: '고급' },
  { value: 'excellent', label: '유창' },
];

const EMPTY_FORM = {
  name: '', name_english: '', name_chinese: '',
  rank_id: '', nationality: '', date_of_birth: '', desired_embark_date: '',
  contact_phone: '', contact_email: '', photo_url: '',
  height: '', weight: '', blood_type: 'none',
  shoe_size: '', coverall_size: '', clothing_size: '',
  eye_color: '', place_of_birth: '', religion: '',
  smoking: 'none', drinking: 'none',
  marital_status: 'none', children_count: '',
  english_read_write: 'none', english_speak_listen: 'none',
  other_languages: '', job_ability: '', motivation: '',
  previous_illness: '',
  drug_test_date: '', drug_test_result: 'none',
  physical_exam_date: '', physical_exam_result: 'none',
  yellow_fever_vaccination: 'none', yellow_fever_date: '',
  passport_number: '', passport_expiry: '',
  seaman_book_number: '', seaman_book_expiry: '',
  seaman_book_flag_number: '', seaman_book_flag_expiry: '',
  sid: '',
};

function calculateAge(dateOfBirth: string): number {
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
  return age;
}

export function CrewDetailPanel({ id, onBack, onSaved, embedded = false }: CrewDetailPanelProps) {
  const { toast } = useToast();
  const { activeTabId, updateTab, tabs } = useTabContext();
  const panelRef = useRef<HTMLDivElement>(null);

  const scrollToTop = useCallback(() => {
    if (!panelRef.current) return;
    let el: Element | null = panelRef.current.parentElement;
    while (el) {
      const s = window.getComputedStyle(el);
      if (s.overflowY === 'auto' || s.overflowY === 'scroll') {
        (el as HTMLElement).scrollTop = 0;
        break;
      }
      el = el.parentElement;
    }
  }, []);

  useEffect(() => { scrollToTop(); }, [scrollToTop]);

  const isNew = !id;
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [nationalities, setNationalities] = useState<Nationality[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [certificateTypes, setCertificateTypes] = useState<CertificateType[]>([]);
  const [certificateCategories, setCertificateCategories] = useState<CertificateCategory[]>([]);
  const [nationalityValidityOverrides, setNationalityValidityOverrides] = useState<CertificateNationalityValidity[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [certFiles, setCertFiles] = useState<Record<number, File>>({});
  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContact[]>([]);
  // 이 선원이 현재 배정되어 있는 활성(임시저장/결재중/승인) 교대계획 — 승선 예정/하선 예정 모두 포함
  const [crewReservations, setCrewReservations] = useState<CrewReservation[]>([]);
  const [formData, setFormData] = useState(EMPTY_FORM);
  // 등급(A/B/C 등)은 직급 자체의 속성이 아니라 "현재 배당된 선박"의 급여표에 물려있는 값이라
  // (crew.service.ts의 getAllWithDetails와 동일한 기준) 활성 승선(발령) 기록의 rank_grade를
  // 우선 쓰고, 없으면 crew_members.current_grade로 대체한다. 폼에서 직접 입력하는 값이 아니라
  // 읽기 전용으로만 보여준다.
  const [currentGrade, setCurrentGrade] = useState<string | null>(null);
  // 선주>플릿>선박 — 채용추천/대기/승선/하선 등 상태와 무관하게 이 선원이 현재 물고 있는 배
  // (crew.service.ts의 getCrewShipContext 참고). 선원을 선박 지정 없이 직접 등록한 경우만 null.
  const [shipContext, setShipContext] = useState<{ ownerName?: string; fleetName?: string; shipName?: string } | null>(null);
  // 대기/승선/하선 단계로 넘어간 선원은 이름/직급/국적/생년월일이 이미 승선경력·증서·계약 등에
  // 물려 쓰이고 있어 자유롭게 고치면 안 되므로 잠근다. 등록됨 계열(등록/검토중/선주송부/승인/거절)
  // 상태일 때만 계속 수정 가능.
  const [identityFieldsLocked, setIdentityFieldsLocked] = useState(false);

  const [seaServiceRecords, setSeaServiceRecords] = useState<SeaServiceRecord[]>([]);
  const [evaluations, setEvaluations] = useState<CrewEvaluationWithDetails[]>([]);
  const [evaluationCounts, setEvaluationCounts] = useState<Record<string, number>>({});
  const [trainingRecords, setTrainingRecords] = useState<TrainingRecord[]>([]);
  const [medicalRecords, setMedicalRecords] = useState<MedicalRecord[]>([]);
  const [medicalCounts, setMedicalCounts] = useState<Record<string, number>>({});
  const [salaryRecords, setSalaryRecords] = useState<CrewSalaryRecord[]>([]);
  const [payrollHistory, setPayrollHistory] = useState<CrewPayrollHistoryRow[]>([]);
  const [payrollShipFilter, setPayrollShipFilter] = useState('all');
  const [payrollYearFilter, setPayrollYearFilter] = useState('all');
  const [payrollPage, setPayrollPage] = useState(1);
  const [payrollSubTab, setPayrollSubTab] = useState<'onboard' | 'sick'>('onboard');
  // 지급된 급여명세 행 클릭 시 새 탭 대신 모달로 상세를 보여준다.
  const [payslipModalOpen, setPayslipModalOpen] = useState(false);
  const [viewingPayslip, setViewingPayslip] = useState<(CrewPayslipWithDetails & { ship_name: string }) | null>(null);
  const [viewingPayslipLoading, setViewingPayslipLoading] = useState(false);
  const [sickPayHistory, setSickPayHistory] = useState<CrewSickPayHistoryRow[]>([]);
  const [sickPayHistoryShipFilter, setSickPayHistoryShipFilter] = useState('all');
  const [sickPayHistoryYearFilter, setSickPayHistoryYearFilter] = useState('all');
  const [sickPayHistoryPage, setSickPayHistoryPage] = useState(1);
  // 상병급여 이력 행 클릭 시 그 케이스의 월별 내역을 모달로 보여준다 — 이미 불러온
  // sickPayHistory에서 같은 record_id끼리 걸러내면 되므로 별도 조회가 필요 없다.
  const [viewingSickPayRecordId, setViewingSickPayRecordId] = useState<string | null>(null);
  const [seaServiceDialogOpen, setSeaServiceDialogOpen] = useState(false);
  const [evaluationDialogOpen, setEvaluationDialogOpen] = useState(false);
  const [evaluationDialogRecord, setEvaluationDialogRecord] = useState<SeaServiceRecord | null>(null);
  const [seaServiceMedicalDialogOpen, setSeaServiceMedicalDialogOpen] = useState(false);
  const [seaServiceMedicalDialogRecord, setSeaServiceMedicalDialogRecord] = useState<SeaServiceRecord | null>(null);
  const [crewEvaluationDialogOpen, setCrewEvaluationDialogOpen] = useState(false);
  const [editingCrewEvaluation, setEditingCrewEvaluation] = useState<CrewEvaluationWithDetails | undefined>();
  const [trainingDialogOpen, setTrainingDialogOpen] = useState(false);
  const [medicalDialogOpen, setMedicalDialogOpen] = useState(false);
  const [salaryDialogOpen, setSalaryDialogOpen] = useState(false);
  const [editingSeaService, setEditingSeaService] = useState<SeaServiceRecord | undefined>();
  const [editingTraining, setEditingTraining] = useState<TrainingRecord | undefined>();
  const [editingMedical, setEditingMedical] = useState<MedicalRecord | undefined>();
  const [editingSalary, setEditingSalary] = useState<CrewSalaryRecord | undefined>();
  const [interviewLogs, setInterviewLogs] = useState<CrewInterviewLogWithDetails[]>([]);
  const [interviewDialogOpen, setInterviewDialogOpen] = useState(false);
  const [editingInterview, setEditingInterview] = useState<CrewInterviewLog | undefined>();

  useEffect(() => {
    supabase.from('ranks').select('*').then(({ data }) => { if (data) setRanks(sortRanksByDisplayOrder(data)); });
    getNationalities(true).then(setNationalities).catch(console.error);
    getCertificateTypes(true).then(setCertificateTypes).catch(console.error);
    getCertificateCategories(true).then(setCertificateCategories).catch(console.error);
    getAllNationalityValidityOverrides().then(setNationalityValidityOverrides).catch(console.error);
    if (!isNew) loadCrew(id!);
    else {
      setLoading(false);
      setFormData(EMPTY_FORM);
      setPreviewUrl('');
      setCertificates([]);
      setEmergencyContacts([]);
      setShipContext(null);
      setIdentityFieldsLocked(false);
    }
  }, [id]);

  const REGISTERED_STATUSES = new Set(['registered', 'under_review', 'sent_to_owner', 'owner_approved', 'owner_rejected']);

  const loadCrew = async (crewId: string) => {
    try {
      setLoading(true);
      const { data, error } = await supabase.from('crew_members').select('*').eq('id', crewId).single();
      if (error) throw error;
      if (!data) { toast({ title: '선원을 찾을 수 없습니다.', variant: 'destructive' }); onBack(); return; }

      setIdentityFieldsLocked(!REGISTERED_STATUSES.has(data.current_status || data.status || 'registered'));
      rotationService.getCrewReservationsByIds([crewId]).then(map => setCrewReservations(map.get(crewId) || []));
      supabase.from('crew_embarkation_records').select('rank_grade').eq('crew_member_id', crewId).eq('status', 'active').maybeSingle()
        .then(({ data: activeEmbark }) => setCurrentGrade(activeEmbark?.rank_grade || data.current_grade || null));
      crewService.getCrewShipContext(crewId).then(setShipContext).catch(() => setShipContext(null));
      setFormData({
        name: data.name || '',
        name_english: data.name_english || '',
        name_chinese: data.name_chinese || '',
        rank_id: data.rank_id || '',
        nationality: data.nationality || '',
        date_of_birth: data.date_of_birth || '',
        desired_embark_date: data.desired_embark_date || '',
        contact_phone: data.phone || '',
        contact_email: data.email || '',
        photo_url: data.photo_url || '',
        height: data.height?.toString() || '',
        weight: data.weight?.toString() || '',
        blood_type: data.blood_type || 'none',
        shoe_size: data.shoe_size || '',
        coverall_size: data.coverall_size || '',
        clothing_size: data.clothing_size || '',
        eye_color: data.eye_color || '',
        place_of_birth: data.place_of_birth || '',
        religion: data.religion || '',
        smoking: data.smoking === true ? 'yes' : data.smoking === false ? 'no' : 'none',
        drinking: data.drinking === true ? 'yes' : data.drinking === false ? 'no' : 'none',
        marital_status: data.marital_status || 'none',
        children_count: data.children_count?.toString() || '',
        english_read_write: data.english_read_write || 'none',
        english_speak_listen: data.english_speak_listen || 'none',
        other_languages: data.other_languages || '',
        job_ability: data.job_ability || '',
        motivation: data.motivation || '',
        previous_illness: data.previous_illness || '',
        drug_test_date: data.drug_test_date || '',
        drug_test_result: data.drug_test_result || 'none',
        physical_exam_date: data.physical_exam_date || '',
        physical_exam_result: data.physical_exam_result || 'none',
        yellow_fever_vaccination: data.yellow_fever_vaccination === true ? 'yes' : data.yellow_fever_vaccination === false ? 'no' : 'none',
        yellow_fever_date: data.yellow_fever_date || '',
        passport_number: data.passport_number || '',
        passport_expiry: data.passport_expiry || '',
        seaman_book_number: data.seaman_book_number || '',
        seaman_book_expiry: data.seaman_book_expiry || '',
        seaman_book_flag_number: data.seaman_book_flag_number || '',
        seaman_book_flag_expiry: data.seaman_book_flag_expiry || '',
        sid: data.sid || '',
      });
      setPreviewUrl(data.photo_url || '');

      try {
        const certs = typeof data.certificates === 'string' ? JSON.parse(data.certificates) : (data.certificates || []);
        setCertificates(Array.isArray(certs) ? certs : []);
      } catch { setCertificates([]); }

      try {
        const contacts = typeof data.emergency_contacts === 'string' ? JSON.parse(data.emergency_contacts) : (data.emergency_contacts || []);
        setEmergencyContacts(Array.isArray(contacts) ? contacts : []);
      } catch { setEmergencyContacts([]); }

      loadExtendedRecords(crewId);
    } catch (e) {
      console.error(e);
      toast({ title: '데이터 로드 실패', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const loadExtendedRecords = async (crewId: string) => {
    try {
      const [sea, train, med, sal, evals, payroll, sickPay, interviews] = await Promise.all([
        getSeaServiceRecords(crewId),
        getTrainingRecords(crewId),
        getMedicalRecords(crewId),
        getCrewSalaryRecords(crewId),
        getEvaluations(crewId),
        crewPayrollService.getCrewPayrollHistory(crewId),
        sickPayService.getCrewSickPayHistory(crewId),
        getCrewInterviewLogs(crewId),
      ]);
      setSeaServiceRecords(sea);
      setTrainingRecords(train);
      setMedicalRecords(med);
      setSalaryRecords(sal);
      setEvaluations(evals);
      setPayrollHistory(payroll);
      setSickPayHistory(sickPay);
      setInterviewLogs(interviews);
      const counts: Record<string, number> = {};
      evals.forEach(e => { if (e.sea_service_record_id) counts[e.sea_service_record_id] = (counts[e.sea_service_record_id] || 0) + 1; });
      setEvaluationCounts(counts);
      const medCounts: Record<string, number> = {};
      med.forEach(m => { if (m.sea_service_record_id) medCounts[m.sea_service_record_id] = (medCounts[m.sea_service_record_id] || 0) + 1; });
      setMedicalCounts(medCounts);
    } catch (e) {
      console.error('Extended records load error:', e);
    }
  };

  const handleDeleteSeaService = async (recordId: string) => {
    if (!confirm('이 승선 기록을 삭제하시겠습니까?')) return;
    try { await deleteSeaServiceRecord(recordId); loadExtendedRecords(id!); toast({ title: '삭제 완료' }); } catch { toast({ title: '삭제 실패', variant: 'destructive' }); }
  };
  const handleDeleteTraining = async (recordId: string) => {
    if (!confirm('이 교육 기록을 삭제하시겠습니까?')) return;
    try { await deleteTrainingRecord(recordId); loadExtendedRecords(id!); toast({ title: '삭제 완료' }); } catch { toast({ title: '삭제 실패', variant: 'destructive' }); }
  };
  const handleDeleteMedical = async (recordId: string) => {
    if (!confirm('이 상병 기록을 삭제하시겠습니까?')) return;
    try { await deleteMedicalRecord(recordId); loadExtendedRecords(id!); toast({ title: '삭제 완료' }); } catch { toast({ title: '삭제 실패', variant: 'destructive' }); }
  };
  const handleDeleteEvaluation = async (recordId: string) => {
    if (!confirm('이 고과 기록을 삭제하시겠습니까?')) return;
    try { await deleteEvaluation(recordId); loadExtendedRecords(id!); toast({ title: '삭제 완료' }); } catch { toast({ title: '삭제 실패', variant: 'destructive' }); }
  };
  const handleDeleteInterview = async (recordId: string) => {
    if (!confirm('이 면담 일지를 삭제하시겠습니까?')) return;
    try { await deleteCrewInterviewLog(recordId); loadExtendedRecords(id!); loadCrew(id!); toast({ title: '삭제 완료' }); } catch { toast({ title: '삭제 실패', variant: 'destructive' }); }
  };
  const handleDeleteSalary = async (recordId: string) => {
    if (!confirm('이 급여 기록을 삭제하시겠습니까?')) return;
    try { await deleteCrewSalaryRecord(recordId); loadExtendedRecords(id!); toast({ title: '삭제 완료' }); } catch { toast({ title: '삭제 실패', variant: 'destructive' }); }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      if (!['image/jpeg','image/jpg','image/png','image/webp'].includes(file.type)) { alert('JPG, PNG, WEBP 형식만 가능합니다.'); return; }
      if (file.size > 5 * 1024 * 1024) { alert('5MB 이하만 가능합니다.'); return; }
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setPreviewUrl(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const uploadPhoto = async (): Promise<string | null> => {
    if (!selectedFile) return formData.photo_url || null;
    try {
      const ext = selectedFile.name.split('.').pop();
      const path = `crew-photos/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
      const { error } = await supabase.storage.from('crew-documents').upload(path, selectedFile);
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('crew-documents').getPublicUrl(path);
      return publicUrl;
    } catch (e) { console.error(e); return null; }
  };

  // 같은 증서 유형이라도 선원 국적(자국 증서 발급 기준)에 따라 유효기간이 다른 경우가 있어,
  // 국적별 예외가 있으면 그걸 우선하고 없으면 증서유형의 기본 유효기간을 따른다.
  const hasExpiryForNationality = (ct: CertificateType): boolean => {
    const override = nationalityValidityOverrides.find(o => o.certificate_type_id === ct.id && o.nationality_code === formData.nationality);
    if (override) return override.validity_period_months != null;
    return !!ct.validity_period_months;
  };

  const addCert = (name?: string) => setCertificates(prev => [...prev, { name: name || '', number: '', issued_date: '', expiry_date: '', issuing_authority: '', no_expiry: false }]);
  const updateCert = (idx: number, field: keyof Certificate, value: string | boolean) => setCertificates(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  const removeCert = (idx: number) => setCertificates(prev => prev.filter((_, i) => i !== idx));
  const handleIssuedDate = (idx: number, value: string) => {
    setCertificates(prev => prev.map((c, i) => {
      if (i !== idx) return c;
      let expiry = c.expiry_date;
      if (value && !c.no_expiry) { const d = new Date(value); d.setFullYear(d.getFullYear() + 5); expiry = d.toISOString().split('T')[0]; }
      return { ...c, issued_date: value, expiry_date: expiry };
    }));
  };
  const handleNoExpiry = (idx: number, checked: boolean) => setCertificates(prev => prev.map((c, i) => i === idx ? { ...c, no_expiry: checked, expiry_date: checked ? '' : c.expiry_date } : c));
  const addContact = () => setEmergencyContacts(prev => [...prev, { name: '', relationship: '', phone: '', note: '' }]);
  const updateContact = (idx: number, field: keyof EmergencyContact, value: string) => setEmergencyContacts(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  const removeContact = (idx: number) => setEmergencyContacts(prev => prev.filter((_, i) => i !== idx));
  const f = (field: string, value: string) => setFormData(p => ({ ...p, [field]: value }));

  const parseBool = (val: string): boolean | null => val === 'yes' ? true : val === 'no' ? false : null;
  const parseOptional = (val: string): string | null => (val && val !== 'none') ? val : null;

  const handleSave = async () => {
    if (!formData.name_english || !formData.rank_id) {
      toast({ title: '필수 항목 누락', description: '이름(영문)과 직급은 필수입니다.', variant: 'destructive' });
      return;
    }
    try {
      setSaving(true);
      let photoUrl = formData.photo_url;
      if (selectedFile) { const u = await uploadPhoto(); if (u) photoUrl = u; }

      const certsWithFiles = await Promise.all(
        certificates.filter(c => c.name.trim()).map(async (cert, idx) => {
          const file = certFiles[idx];
          if (file) {
            const ext = file.name.split('.').pop();
            const path = `crew-certificates/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
            const { error } = await supabase.storage.from('documents').upload(path, file);
            if (!error) return { ...cert, file_path: path, file_name: file.name };
          }
          return cert;
        })
      );

      let rankName = '';
      if (formData.rank_id) {
        const { data: rd } = await supabase.from('ranks').select('name').eq('id', formData.rank_id).single();
        if (rd) rankName = rd.name;
      }

      const updateData: Record<string, unknown> = {
        name: formData.name,
        name_english: formData.name_english || null,
        name_chinese: formData.name_chinese || null,
        rank_id: formData.rank_id,
        rank: rankName,
        nationality: formData.nationality || null,
        date_of_birth: formData.date_of_birth || null,
        desired_embark_date: formData.desired_embark_date || null,
        phone: formData.contact_phone || null,
        email: formData.contact_email || null,
        photo_url: photoUrl || null,
        height: formData.height ? parseFloat(formData.height) : null,
        weight: formData.weight ? parseFloat(formData.weight) : null,
        blood_type: parseOptional(formData.blood_type),
        shoe_size: formData.shoe_size || null,
        coverall_size: formData.coverall_size || null,
        clothing_size: formData.clothing_size || null,
        eye_color: formData.eye_color || null,
        place_of_birth: formData.place_of_birth || null,
        religion: formData.religion || null,
        smoking: parseBool(formData.smoking),
        drinking: parseBool(formData.drinking),
        marital_status: parseOptional(formData.marital_status),
        children_count: formData.children_count ? parseInt(formData.children_count) : null,
        english_read_write: parseOptional(formData.english_read_write),
        english_speak_listen: parseOptional(formData.english_speak_listen),
        other_languages: formData.other_languages || null,
        job_ability: formData.job_ability || null,
        motivation: formData.motivation || null,
        previous_illness: formData.previous_illness || null,
        drug_test_date: formData.drug_test_date || null,
        drug_test_result: parseOptional(formData.drug_test_result),
        physical_exam_date: formData.physical_exam_date || null,
        physical_exam_result: parseOptional(formData.physical_exam_result),
        yellow_fever_vaccination: parseBool(formData.yellow_fever_vaccination),
        yellow_fever_date: formData.yellow_fever_date || null,
        passport_number: formData.passport_number || null,
        passport_expiry: formData.passport_expiry || null,
        seaman_book_number: formData.seaman_book_number || null,
        seaman_book_expiry: formData.seaman_book_expiry || null,
        seaman_book_flag_number: formData.seaman_book_flag_number || null,
        seaman_book_flag_expiry: formData.seaman_book_flag_expiry || null,
        sid: formData.sid || null,
        emergency_contacts: emergencyContacts.filter(c => c.name || c.phone),
        certificates: certsWithFiles,
        updated_at: new Date().toISOString(),
      };

      if (isNew) {
        const { data: newCrew, error } = await supabase
          .from('crew_members')
          .insert({ ...updateData, current_status: 'registered', status: 'registered', created_at: new Date().toISOString() })
          .select().single();
        if (error) throw new Error(error.message);
        toast({ title: '등록 완료', description: '선원이 등록되었습니다.' });
        onSaved(newCrew.id);
      } else {
        const { error } = await supabase.from('crew_members').update(updateData).eq('id', id!);
        if (error) throw new Error(error.message);
        await loadCrew(id!);
        setSelectedFile(null);
        setCertFiles({});
        toast({ title: '저장 완료', description: '선원 정보가 수정되었습니다.' });
        onSaved(id!);
      }
    } catch (error) {
      console.error(error);
      toast({ title: '저장 실패', description: String(error instanceof Error ? error.message : error), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const openCertFile = (path: string) => {
    const { data } = supabase.storage.from('documents').getPublicUrl(path);
    if (data?.publicUrl) window.open(data.publicUrl, '_blank');
  };

  const selectedRank = ranks.find(r => r.id === formData.rank_id);
  const shipContextParts = shipContext
    ? [shipContext.ownerName, shipContext.fleetName, shipContext.shipName].filter(Boolean)
    : [];
  const rankGradeLabel = selectedRank
    ? `${selectedRank.rank_code}${currentGrade ? `(${currentGrade})` : ''}`
    : '';

  // 탭 제목을 이름만이 아니라 "직급 이름"으로 유지 — 목록에서 열 때 붙는 제목은 그 시점의
  // 직급코드로 고정되므로, 직급/이름을 이 화면에서 고쳤을 때도 탭 제목이 따라가도록 갱신한다.
  // 탭은 비활성 상태에서도(display:none) 컴포넌트가 계속 마운트돼 있으므로, activeTabId가
  // "지금 화면에 보이는 다른 탭"으로 바뀌어도 이 effect는 여전히 실행된다 — activeTabId를
  // 무조건 내 탭이라고 믿으면 그 다른 탭의 제목을 이 선원 이름으로 덮어써 버리게 된다.
  // 실제로 활성화된 탭의 경로가 이 선원의 상세 경로일 때만(=이 패널이 진짜 보이고 있을 때만) 갱신한다.
  useEffect(() => {
    if (!activeTabId || isNew || !id) return;
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (!activeTab || activeTab.path !== `/crew/${id}`) return;
    const label = [selectedRank?.rank_code, crewDisplayName(formData)].filter(Boolean).join(' ');
    // updateTab은 값이 같아도 항상 tabs 배열을 새로 만들어 리렌더를 일으킨다 — tabs가 이 effect의
    // 의존성이므로, 제목이 이미 같은데도 매번 updateTab을 부르면 리렌더→effect 재실행→updateTab→
    // 리렌더…로 무한루프에 빠진다(실제로 선원카드가 빈 화면이 되는 원인이었음). 이미 같으면 건너뛴다.
    if (label && activeTab.title !== label) updateTab(activeTabId, { title: label });
  }, [activeTabId, tabs, isNew, id, selectedRank?.rank_code, formData.name, formData.name_english, updateTab]);

  useEffect(() => { setPayrollPage(1); }, [payrollShipFilter, payrollYearFilter]);
  useEffect(() => { setSickPayHistoryPage(1); }, [sickPayHistoryShipFilter, sickPayHistoryYearFilter]);

  const openPayslipModal = async (payslipId: string) => {
    setPayslipModalOpen(true);
    setViewingPayslip(null);
    setViewingPayslipLoading(true);
    try {
      const data = await crewPayrollService.getPayslipById(payslipId);
      setViewingPayslip(data);
    } finally {
      setViewingPayslipLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const PAYROLL_PAGE_SIZE = 10;
  const payrollYearOptions = [...new Set(payrollHistory.map(r => r.year_month.slice(0, 4)))].sort().reverse();
  const payrollShipOptions = [...new Set(payrollHistory.map(r => r.ship_name).filter(Boolean))].sort();
  const filteredPayrollHistory = payrollHistory.filter(r =>
    (payrollYearFilter === 'all' || r.year_month.startsWith(payrollYearFilter)) &&
    (payrollShipFilter === 'all' || r.ship_name === payrollShipFilter)
  );
  const payrollTotalPages = Math.max(1, Math.ceil(filteredPayrollHistory.length / PAYROLL_PAGE_SIZE));
  const pagedPayrollHistory = filteredPayrollHistory.slice((payrollPage - 1) * PAYROLL_PAGE_SIZE, payrollPage * PAYROLL_PAGE_SIZE);

  // 상병급여 이력도 지급된 급여명세와 완전히 동일한 필터/페이징 로직을 쓴다.
  const SICK_PAY_PAGE_SIZE = 10;
  const sickPayHistoryYearOptions = [...new Set(sickPayHistory.map(r => r.year_month.slice(0, 4)))].sort().reverse();
  const sickPayHistoryShipOptions = [...new Set(sickPayHistory.map(r => r.ship_name).filter(Boolean))].sort();
  const filteredSickPayHistory = sickPayHistory.filter(r =>
    (sickPayHistoryYearFilter === 'all' || r.year_month.startsWith(sickPayHistoryYearFilter)) &&
    (sickPayHistoryShipFilter === 'all' || r.ship_name === sickPayHistoryShipFilter)
  );
  const sickPayHistoryTotalPages = Math.max(1, Math.ceil(filteredSickPayHistory.length / SICK_PAY_PAGE_SIZE));
  const pagedSickPayHistory = filteredSickPayHistory.slice((sickPayHistoryPage - 1) * SICK_PAY_PAGE_SIZE, sickPayHistoryPage * SICK_PAY_PAGE_SIZE);
  const viewingSickPayEntries = sickPayHistory.filter(r => r.record_id === viewingSickPayRecordId);

  const formBody = (
    <>
      {/* 사진 + 선주/플릿/선박·직급/이름(국적) — 어느 탭에서든 항상 보이도록 탭 밖에 배치 */}
      <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
        <div className="flex flex-col items-center gap-1.5 shrink-0">
          {previewUrl ? (
            <div className="relative">
              <img
                src={previewUrl}
                alt=""
                className="w-20 h-20 rounded-full object-cover border-2 border-gray-200 cursor-pointer hover:opacity-80"
                onClick={() => setPhotoModalOpen(true)}
              />
              <button type="button" onClick={() => { setSelectedFile(null); setPreviewUrl(''); f('photo_url', ''); }} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5">
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <div className="w-20 h-20 rounded-full bg-gray-200 flex items-center justify-center border-2 border-gray-200">
              <User className="w-10 h-10 text-gray-400" />
            </div>
          )}
          <Label htmlFor="photo-input" className="cursor-pointer">
            <div className="inline-flex items-center gap-1 px-2 py-1 bg-white border rounded-md hover:bg-gray-50 text-[11px]">
              <Upload className="w-3 h-3" />사진 업로드
            </div>
          </Label>
          <Input id="photo-input" type="file" accept="image/jpeg,image/jpg,image/png,image/webp" onChange={handleFileSelect} className="hidden" />
        </div>
        <div>
          {shipContextParts.length > 0 && (
            <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-0.5">
              {shipContextParts.map((part, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  {i > 0 && <span className="text-gray-300">|</span>}
                  {part}
                </span>
              ))}
            </div>
          )}
          <div className="text-xl font-bold text-gray-900">
            {rankGradeLabel && <span className="text-blue-700 mr-2">{rankGradeLabel}</span>}
            {crewDisplayName(formData) || (isNew ? '새 선원 등록' : '선원 정보 수정')}
            {formData.nationality && <span className="text-gray-400 font-normal ml-1.5">({formData.nationality})</span>}
          </div>
        </div>
      </div>

      <Dialog open={photoModalOpen} onOpenChange={setPhotoModalOpen}>
        <DialogContent className="max-w-2xl p-2 bg-transparent border-none shadow-none">
          <DialogTitle className="sr-only">선원 사진</DialogTitle>
          <img src={previewUrl} alt="" className="w-full h-auto rounded-lg" />
        </DialogContent>
      </Dialog>

      {/* 탭 */}
      <Tabs defaultValue="basic" onValueChange={scrollToTop}>
        <div className="space-y-1">
          <TabsList className="grid w-full grid-cols-3 h-8">
            <TabsTrigger value="basic" className="text-xs">기본정보</TabsTrigger>
            <TabsTrigger value="certificates" className="text-xs">
              증서{certificates.length > 0 && <span className="ml-1 bg-blue-100 text-blue-700 rounded-full px-1.5">{certificates.length}</span>}
            </TabsTrigger>
            <TabsTrigger value="emergency" className="text-xs">비상연락망</TabsTrigger>
          </TabsList>
          {!isNew && (
            <TabsList className="grid w-full grid-cols-6 h-8">
              <TabsTrigger value="sea_service" className="text-xs">
                승선경력{seaServiceRecords.length > 0 && <span className="ml-1 bg-green-100 text-green-700 rounded-full px-1.5">{seaServiceRecords.length}</span>}
              </TabsTrigger>
              <TabsTrigger value="training" className="text-xs">
                교육이력{trainingRecords.length > 0 && <span className="ml-1 bg-purple-100 text-purple-700 rounded-full px-1.5">{trainingRecords.length}</span>}
              </TabsTrigger>
              <TabsTrigger value="evaluations" className="text-xs">
                고과{evaluations.length > 0 && <span className="ml-1 bg-yellow-100 text-yellow-700 rounded-full px-1.5">{evaluations.length}</span>}
              </TabsTrigger>
              <TabsTrigger value="medical" className="text-xs">
                상병기록{medicalRecords.length > 0 && <span className="ml-1 bg-orange-100 text-orange-700 rounded-full px-1.5">{medicalRecords.length}</span>}
              </TabsTrigger>
              <TabsTrigger value="salary_records" className="text-xs">
                급여이력{(payrollHistory.length + salaryRecords.length + sickPayHistory.length) > 0 && <span className="ml-1 bg-yellow-100 text-yellow-700 rounded-full px-1.5">{payrollHistory.length + salaryRecords.length + sickPayHistory.length}</span>}
              </TabsTrigger>
              <TabsTrigger value="interviews" className="text-xs">
                면담일지{interviewLogs.length > 0 && <span className="ml-1 bg-teal-100 text-teal-700 rounded-full px-1.5">{interviewLogs.length}</span>}
              </TabsTrigger>
            </TabsList>
          )}
        </div>

        {/* 기본 정보 */}
        <TabsContent value="basic" className="space-y-3 mt-3 data-[state=inactive]:hidden">
          {identityFieldsLocked && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
              대기/승선/하선 단계로 넘어간 선원은 이름·직급·국적·생년월일을 수정할 수 없습니다.
            </p>
          )}
          <div className="grid grid-cols-3 gap-3">
            <div><Label className="text-xs">이름 (영문) *</Label><Input value={formData.name_english} onChange={e => f('name_english', e.target.value)} className="mt-1 h-9" placeholder="HONG GIL DONG" disabled={identityFieldsLocked} /></div>
            <div>
              <Label className="text-xs">직급 *</Label>
              <Select value={formData.rank_id} onValueChange={v => f('rank_id', v)} disabled={identityFieldsLocked}>
                <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="직급 선택" /></SelectTrigger>
                <SelectContent>{ranks.map(r => <SelectItem key={r.id} value={r.id}>{r.name} ({r.rank_code})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">등급</Label>
              <Input value={currentGrade || ''} className="mt-1 h-9 bg-gray-50" disabled placeholder="배정된 선박의 급여표 기준" />
            </div>
          </div>

          {formData.nationality === 'KR' && (
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">이름 (한국어)</Label><Input value={formData.name} onChange={e => f('name', e.target.value)} className="mt-1 h-9" placeholder="홍길동" disabled={identityFieldsLocked} /></div>
              <div><Label className="text-xs">이름 (한자)</Label><Input value={formData.name_chinese} onChange={e => f('name_chinese', e.target.value)} className="mt-1 h-9" placeholder="洪吉童" disabled={identityFieldsLocked} /></div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">국적</Label>
              <Select value={formData.nationality} onValueChange={v => f('nationality', v)} disabled={identityFieldsLocked}>
                <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="국적 선택" /></SelectTrigger>
                <SelectContent>{nationalities.map(n => <SelectItem key={n.id} value={n.country_code}>{n.country_name_ko} ({n.country_code})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">생년월일{formData.date_of_birth && <span className="text-gray-400 font-normal"> (만 {calculateAge(formData.date_of_birth)}세)</span>}</Label>
              <Input type="date" value={formData.date_of_birth} onChange={e => f('date_of_birth', e.target.value)} className="mt-1 h-9" disabled={identityFieldsLocked} />
            </div>
            <div><Label className="text-xs">연락처</Label><Input value={formData.contact_phone} onChange={e => f('contact_phone', e.target.value)} className="mt-1 h-9" /></div>
            <div><Label className="text-xs">이메일</Label><Input type="email" value={formData.contact_email} onChange={e => f('contact_email', e.target.value)} className="mt-1 h-9" /></div>
            <div>
              <Label className="text-xs">승선 희망일</Label>
              <Input type="date" value={formData.desired_embark_date} onChange={e => f('desired_embark_date', e.target.value)} className="mt-1 h-9" />
            </div>
          </div>

          <div className="border-t pt-3">
          <p className="text-xs font-semibold text-gray-600">신체 정보</p>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">출생지</Label><Input value={formData.place_of_birth} onChange={e => f('place_of_birth', e.target.value)} className="mt-1 h-9" placeholder="예: Jakarta, Indonesia" /></div>
            <div>
              <Label className="text-xs">혈액형</Label>
              <Select value={formData.blood_type} onValueChange={v => f('blood_type', v)}>
                <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">선택 안함</SelectItem>
                  {['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">키 (cm)</Label><Input type="number" value={formData.height} onChange={e => f('height', e.target.value)} className="mt-1 h-9" placeholder="170" /></div>
            <div><Label className="text-xs">몸무게 (kg)</Label><Input type="number" value={formData.weight} onChange={e => f('weight', e.target.value)} className="mt-1 h-9" placeholder="70" /></div>
            <div>
              <Label className="text-xs">눈 색</Label>
              <Select value={formData.eye_color || '_none'} onValueChange={v => f('eye_color', v === '_none' ? '' : v)}>
                <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="눈 색 선택" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">선택 안함</SelectItem>
                  {EYE_COLORS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">신발 사이즈 (mm)</Label>
              <Select value={formData.shoe_size} onValueChange={v => f('shoe_size', v)}>
                <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="신발 사이즈" /></SelectTrigger>
                <SelectContent>{SHOE_SIZES.map(s => <SelectItem key={s} value={s}>{s} mm</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">작업복 사이즈</Label>
              <Select value={formData.coverall_size} onValueChange={v => f('coverall_size', v)}>
                <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="작업복 사이즈" /></SelectTrigger>
                <SelectContent>{COVERALL_SIZES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">의류 사이즈</Label>
              <Select value={formData.clothing_size} onValueChange={v => f('clothing_size', v)}>
                <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="의류 사이즈" /></SelectTrigger>
                <SelectContent>{COVERALL_SIZES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div className="border-t pt-3">
            <p className="text-xs font-semibold text-gray-600 mb-2">인적사항</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">종교</Label>
                <Select value={formData.religion || '_none'} onValueChange={v => f('religion', v === '_none' ? '' : v)}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="종교 선택" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">선택 안함</SelectItem>
                    {RELIGIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">결혼 여부</Label>
                <Select value={formData.marital_status} onValueChange={v => f('marital_status', v)}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="선택" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">선택 안함</SelectItem>
                    {MARITAL_STATUSES.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">자녀 수</Label><Input type="number" min="0" value={formData.children_count} onChange={e => f('children_count', e.target.value)} className="mt-1 h-9" placeholder="0" /></div>
              <div />
              <div>
                <Label className="text-xs">흡연</Label>
                <Select value={formData.smoking} onValueChange={v => f('smoking', v)}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">선택 안함</SelectItem>
                    <SelectItem value="yes">흡연</SelectItem>
                    <SelectItem value="no">비흡연</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">음주</Label>
                <Select value={formData.drinking} onValueChange={v => f('drinking', v)}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">선택 안함</SelectItem>
                    <SelectItem value="yes">음주</SelectItem>
                    <SelectItem value="no">비음주</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>
        </TabsContent>

        {/* 연락처 */}
        <TabsContent value="emergency" className="mt-3 data-[state=inactive]:hidden">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">비상 연락처 및 가족 연락처</span>
              <Button type="button" variant="outline" size="sm" onClick={addContact} className="h-7 text-xs gap-1">
                <Plus className="h-3 w-3" />추가
              </Button>
            </div>
            {emergencyContacts.length === 0 ? (
              <div className="text-center py-6 text-sm text-gray-400 border-2 border-dashed rounded-md">연락처를 추가하세요.</div>
            ) : emergencyContacts.map((contact, idx) => (
              <div key={idx} className="p-3 border rounded-md bg-gray-50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-gray-600">연락처 {idx + 1}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeContact(idx)} className="h-6 w-6 p-0 text-red-500"><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label className="text-xs text-gray-500">이름</Label><Input value={contact.name} onChange={e => updateContact(idx, 'name', e.target.value)} className="h-8 text-xs mt-0.5" /></div>
                  <div>
                    <Label className="text-xs text-gray-500">관계</Label>
                    <Select value={contact.relationship} onValueChange={v => updateContact(idx, 'relationship', v)}>
                      <SelectTrigger className="h-8 text-xs mt-0.5"><SelectValue placeholder="관계 선택" /></SelectTrigger>
                      <SelectContent>{RELATIONSHIPS.map(r => <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-xs text-gray-500">연락처</Label><Input value={contact.phone} onChange={e => updateContact(idx, 'phone', e.target.value)} className="h-8 text-xs mt-0.5" /></div>
                  <div><Label className="text-xs text-gray-500">비고</Label><Input value={contact.note || ''} onChange={e => updateContact(idx, 'note', e.target.value)} className="h-8 text-xs mt-0.5" /></div>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* 증서 */}
        <TabsContent value="certificates" className="mt-3 data-[state=inactive]:hidden">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">
                보유 증서 ({certificates.filter(c => c.number || c.issued_date || c.expiry_date).length}건 입력됨 / {certificates.length}건)
              </span>
              <div className="flex gap-2">
                {certificateTypes.length > 0 && certificates.length === 0 && (
                  <Button type="button" variant="default" size="sm" onClick={() => {
                    const newCerts = certificateTypes.map(ct => ({
                      name: `${ct.type_name_en}`,
                      number: '', issued_date: '', expiry_date: '', issuing_authority: '', no_expiry: !hasExpiryForNationality(ct),
                    }));
                    setCertificates(newCerts);
                  }} className="h-8 text-xs gap-1"><Plus className="h-3 w-3" />전체 증서 불러오기</Button>
                )}
                {certificateTypes.length > 0 && certificates.length > 0 && (
                  <Button type="button" variant="outline" size="sm" onClick={() => {
                    const existingNames = new Set(certificates.map(c => c.name));
                    const newCerts = certificateTypes
                      .filter(ct => !existingNames.has(`${ct.type_name_en}`))
                      .map(ct => ({ name: `${ct.type_name_en}`, number: '', issued_date: '', expiry_date: '', issuing_authority: '', no_expiry: !hasExpiryForNationality(ct) }));
                    if (newCerts.length > 0) setCertificates(prev => [...prev, ...newCerts]);
                    else toast({ title: '모든 증서 유형이 이미 추가되어 있습니다.' });
                  }} className="h-8 text-xs gap-1"><Plus className="h-3 w-3" />누락 증서 추가</Button>
                )}
                <Button type="button" variant="outline" size="sm" onClick={() => addCert()} className="h-8 text-xs gap-1"><Plus className="h-3 w-3" />직접 입력</Button>
              </div>
            </div>

            {certificates.length === 0 ? (
              <div className="text-center py-8 border-2 border-dashed rounded-md">
                <p className="text-sm text-gray-400 mb-2">증서를 추가하세요.</p>
                {certificateTypes.length > 0 && (
                  <Button type="button" variant="outline" size="sm" onClick={() => {
                    setCertificates(certificateTypes.map(ct => ({
                      name: `${ct.type_name_en}`,
                      number: '', issued_date: '', expiry_date: '', issuing_authority: '', no_expiry: !hasExpiryForNationality(ct),
                    })));
                  }} className="text-xs gap-1"><Plus className="h-3 w-3" />등록된 증서 유형 전체 불러오기 ({certificateTypes.length}건)</Button>
                )}
              </div>
            ) : (
              <>
                {/* 카테고리별 그룹핑 */}
                {(() => {
                  const grouped: Record<string, { cert: Certificate; idx: number }[]> = {};
                  certificates.forEach((cert, idx) => {
                    const matchedType = certificateTypes.find(ct => cert.name === `${ct.type_name_en}`);
                    const category = matchedType?.category || 'custom';
                    if (!grouped[category]) grouped[category] = [];
                    grouped[category].push({ cert, idx });
                  });
                  const categoryOrder = [...certificateCategories.map(c => c.code), 'custom'];
                  return categoryOrder.filter(cat => grouped[cat]?.length > 0).map(category => (
                    <div key={category} className="space-y-1.5">
                      <div className="flex items-center gap-2 pt-2">
                        <Badge variant="outline" className="text-xs font-semibold">
                          {category === 'custom' ? '직접 입력' : certificateCategories.find(c => c.code === category)?.name || category}
                        </Badge>
                        <div className="flex-1 border-t border-gray-200" />
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead><tr className="border-b bg-gray-50/50">
                            <th className="text-left p-1.5 w-[200px]">증서명</th>
                            <th className="text-left p-1.5 w-[120px]">증서번호</th>
                            <th className="text-left p-1.5 w-[110px]">발급일</th>
                            <th className="text-left p-1.5 w-[110px]">만료일</th>
                            <th className="text-left p-1.5 w-[120px]">발급기관</th>
                            <th className="text-left p-1.5 w-[100px]">파일</th>
                            <th className="text-center p-1.5 w-[36px]"></th>
                          </tr></thead>
                          <tbody>
                            {grouped[category].map(({ cert, idx }) => {
                              const hasData = !!(cert.number || cert.issued_date || cert.expiry_date);
                              return (
                                <tr key={idx} className={`border-b ${hasData ? 'bg-blue-50/30' : 'hover:bg-gray-50/50'}`}>
                                  <td className="p-1">
                                    {category === 'custom' ? (
                                      <Input value={cert.name} onChange={e => updateCert(idx, 'name', e.target.value)} className="h-7 text-xs" placeholder="증서명" />
                                    ) : (
                                      <span className="text-xs px-1 truncate block" title={cert.name}>{cert.name}</span>
                                    )}
                                  </td>
                                  <td className="p-1"><Input value={cert.number || ''} onChange={e => updateCert(idx, 'number', e.target.value)} className="h-7 text-xs" placeholder="번호" /></td>
                                  <td className="p-1"><Input type="date" value={cert.issued_date || ''} onChange={e => handleIssuedDate(idx, e.target.value)} className="h-7 text-xs" /></td>
                                  <td className="p-1">
                                    {cert.no_expiry ? (
                                      <span className="text-xs text-gray-400 px-1 cursor-pointer" onClick={() => handleNoExpiry(idx, false)}>무기한</span>
                                    ) : (
                                      <Input type="date" value={cert.expiry_date || ''} onChange={e => updateCert(idx, 'expiry_date', e.target.value)} className="h-7 text-xs" />
                                    )}
                                  </td>
                                  <td className="p-1"><Input value={cert.issuing_authority || ''} onChange={e => updateCert(idx, 'issuing_authority', e.target.value)} className="h-7 text-xs" placeholder="기관" /></td>
                                  <td className="p-1">
                                    {cert.file_name ? (
                                      <div className="flex items-center gap-1 text-xs text-blue-600">
                                        <span className="truncate cursor-pointer" onClick={() => cert.file_path && openCertFile(cert.file_path)}>{cert.file_name.slice(0, 8)}...</span>
                                        <button type="button" onClick={() => { updateCert(idx, 'file_path', ''); updateCert(idx, 'file_name', ''); }} className="text-red-400 shrink-0"><X className="h-3 w-3" /></button>
                                      </div>
                                    ) : certFiles[idx] ? (
                                      <div className="flex items-center gap-1 text-xs text-green-600">
                                        <span className="truncate">{certFiles[idx].name.slice(0, 8)}...</span>
                                        <button type="button" onClick={() => setCertFiles(prev => { const n = { ...prev }; delete n[idx]; return n; })} className="text-red-400 shrink-0"><X className="h-3 w-3" /></button>
                                      </div>
                                    ) : (
                                      <label className="flex items-center gap-1 text-xs text-gray-400 cursor-pointer hover:text-gray-600">
                                        <Upload className="h-3 w-3 shrink-0" /><span>파일</span>
                                        <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={e => { const file = e.target.files?.[0]; if (file) { if (file.size > 10 * 1024 * 1024) { alert('10MB 초과'); return; } setCertFiles(prev => ({ ...prev, [idx]: file })); } }} />
                                      </label>
                                    )}
                                  </td>
                                  <td className="p-1 text-center">
                                    <Button type="button" variant="ghost" size="sm" onClick={() => removeCert(idx)} className="h-6 w-6 p-0 text-red-400 hover:text-red-600"><Trash2 className="h-3 w-3" /></Button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ));
                })()}
              </>
            )}
          </div>
        </TabsContent>
        {/* 승선경력 */}
        {!isNew && (
          <TabsContent value="sea_service" className="mt-3 data-[state=inactive]:hidden">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">승선 경력 ({seaServiceRecords.length}건)</span>
                <Button type="button" variant="outline" size="sm" onClick={() => { setEditingSeaService(undefined); setSeaServiceDialogOpen(true); }} className="h-7 text-xs gap-1"><Plus className="h-3 w-3" />추가</Button>
              </div>
              {seaServiceRecords.length === 0 ? (
                <div className="text-center py-6 text-sm text-gray-400 border-2 border-dashed rounded-md">승선 경력을 추가하세요.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="border-b bg-gray-50">
                      <th className="text-left p-2">선주사</th><th className="text-left p-2">선박관리사</th><th className="text-left p-2">매닝사</th><th className="text-left p-2">선박명</th><th className="text-left p-2">직급</th><th className="text-left p-2">승선일</th><th className="text-left p-2">하선일</th><th className="text-left p-2">하선사유</th><th className="text-left p-2">유형</th><th className="text-center p-2">고과</th><th className="text-center p-2">상병기록</th><th className="text-center p-2">작업</th>
                    </tr></thead>
                    <tbody>
                      {seaServiceRecords.map(r => (
                        <tr key={r.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => { setEditingSeaService(r); setSeaServiceDialogOpen(true); }}>
                          <td className="p-2 text-gray-600">{r.owner_company_name || '-'}</td>
                          <td className="p-2 text-gray-600">{r.ship_manager_name || '-'}</td>
                          <td className="p-2 text-gray-600">{r.manning_agency_name || '-'}</td>
                          <td className="p-2 font-medium">{r.ship_name}</td>
                          <td className="p-2">{r.rank}{r.rank_grade ? `(${r.rank_grade})` : ''}</td>
                          <td className="p-2">{r.sign_on_date}</td>
                          <td className="p-2">{r.sign_off_date || '-'}</td>
                          <td className="p-2">{r.sign_off_reason_name || r.sign_off_reason || '-'}</td>
                          <td className="p-2"><Badge variant="outline" className="text-xs">{r.record_type === 'pre_company' ? '입사 전' : '회사 배치'}</Badge></td>
                          <td className="p-2 text-center" onClick={e => e.stopPropagation()}>
                            {evaluationCounts[r.id] ? (
                              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1 text-yellow-700 bg-yellow-50 hover:bg-yellow-100" onClick={() => { setEvaluationDialogRecord(r); setEvaluationDialogOpen(true); }}>
                                <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />고과 {evaluationCounts[r.id]}건
                              </Button>
                            ) : (
                              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1 text-gray-400" onClick={() => { setEvaluationDialogRecord(r); setEvaluationDialogOpen(true); }}>
                                <Star className="h-3 w-3" />고과
                              </Button>
                            )}
                          </td>
                          <td className="p-2 text-center" onClick={e => e.stopPropagation()}>
                            {medicalCounts[r.id] ? (
                              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1 text-orange-700 bg-orange-50 hover:bg-orange-100" onClick={() => { setSeaServiceMedicalDialogRecord(r); setSeaServiceMedicalDialogOpen(true); }}>
                                <Stethoscope className="h-3 w-3" />상병기록 {medicalCounts[r.id]}건
                              </Button>
                            ) : (
                              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1 text-gray-400" onClick={() => { setSeaServiceMedicalDialogRecord(r); setSeaServiceMedicalDialogOpen(true); }}>
                                <Stethoscope className="h-3 w-3" />상병기록
                              </Button>
                            )}
                          </td>
                          <td className="p-2 text-center" onClick={e => e.stopPropagation()}>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500" onClick={() => handleDeleteSeaService(r.id)}><Trash2 className="h-3 w-3" /></Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <SeaServiceDialog open={seaServiceDialogOpen} onOpenChange={setSeaServiceDialogOpen} crewId={id!} record={editingSeaService} onSuccess={() => loadExtendedRecords(id!)} />
            <SeaServiceEvaluationDialog open={evaluationDialogOpen} onOpenChange={setEvaluationDialogOpen} crewId={id!} record={evaluationDialogRecord} onChanged={() => loadExtendedRecords(id!)} />
            <SeaServiceMedicalDialog open={seaServiceMedicalDialogOpen} onOpenChange={setSeaServiceMedicalDialogOpen} crewId={id!} record={seaServiceMedicalDialogRecord} onChanged={() => loadExtendedRecords(id!)} />
          </TabsContent>
        )}

        {/* 교육이력 */}
        {!isNew && (
          <TabsContent value="training" className="mt-3 data-[state=inactive]:hidden">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">교육 이력 ({trainingRecords.length}건)</span>
                <Button type="button" variant="outline" size="sm" onClick={() => { setEditingTraining(undefined); setTrainingDialogOpen(true); }} className="h-7 text-xs gap-1"><Plus className="h-3 w-3" />추가</Button>
              </div>
              {trainingRecords.length === 0 ? (
                <div className="text-center py-6 text-sm text-gray-400 border-2 border-dashed rounded-md">교육 이력을 추가하세요.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="border-b bg-gray-50">
                      <th className="text-left p-2">교육명</th><th className="text-left p-2">유형</th><th className="text-left p-2">시작일</th><th className="text-left p-2">종료일</th><th className="text-left p-2">결과</th><th className="text-center p-2">작업</th>
                    </tr></thead>
                    <tbody>
                      {trainingRecords.map(r => (
                        <tr key={r.id} className="border-b hover:bg-gray-50">
                          <td className="p-2 font-medium">{r.training_name}</td>
                          <td className="p-2">{r.training_type === 'safety' ? '안전' : r.training_type === 'technical' ? '기술' : r.training_type === 'management' ? '관리' : r.training_type === 'certification' ? '자격증' : r.training_type || '-'}</td>
                          <td className="p-2">{r.start_date}</td>
                          <td className="p-2">{r.end_date || '-'}</td>
                          <td className="p-2">
                            {r.result === 'passed' ? <Badge className="bg-green-100 text-green-700 text-xs">합격</Badge>
                              : r.result === 'failed' ? <Badge className="bg-red-100 text-red-700 text-xs">불합격</Badge>
                              : r.result === 'in_progress' ? <Badge className="bg-blue-100 text-blue-700 text-xs">진행 중</Badge>
                              : '-'}
                          </td>
                          <td className="p-2 text-center">
                            <div className="flex justify-center gap-1">
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => { setEditingTraining(r); setTrainingDialogOpen(true); }}><Edit2 className="h-3 w-3" /></Button>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500" onClick={() => handleDeleteTraining(r.id)}><Trash2 className="h-3 w-3" /></Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <TrainingRecordDialog open={trainingDialogOpen} onOpenChange={setTrainingDialogOpen} crewId={id!} record={editingTraining} onSuccess={() => loadExtendedRecords(id!)} />
          </TabsContent>
        )}

        {/* 고과 — 승선경력 탭에서 승선 건별로 작성한 것 포함, 이 선원의 모든 고과를 모아 보여준다 */}
        {!isNew && (
          <TabsContent value="evaluations" className="mt-3 data-[state=inactive]:hidden">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">고과 ({evaluations.length}건)</span>
                <Button type="button" variant="outline" size="sm" onClick={() => { setEditingCrewEvaluation(undefined); setCrewEvaluationDialogOpen(true); }} className="h-7 text-xs gap-1"><Plus className="h-3 w-3" />추가</Button>
              </div>
              {evaluations.length === 0 ? (
                <div className="text-center py-6 text-sm text-gray-400 border-2 border-dashed rounded-md">등록된 고과가 없습니다.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="border-b bg-gray-50">
                      <th className="text-left p-2">평가 기간</th><th className="text-left p-2">선박</th><th className="text-center p-2">평균점수</th><th className="text-center p-2">추천</th><th className="text-left p-2">평가자</th><th className="text-center p-2">작업</th>
                    </tr></thead>
                    <tbody>
                      {evaluations.map(e => (
                        <tr key={e.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => { setEditingCrewEvaluation(e); setCrewEvaluationDialogOpen(true); }}>
                          <td className="p-2">{e.evaluation_period_start} ~ {e.evaluation_period_end}</td>
                          <td className="p-2">{e.ship_name || '-'}</td>
                          <td className="p-2 text-center">{e.overall_rating ? <span className="inline-flex items-center gap-0.5 font-semibold"><Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />{e.overall_rating}</span> : '-'}</td>
                          <td className="p-2 text-center">{e.recommendation ? <Badge className="text-xs">{REC_LABELS[e.recommendation] || e.recommendation}</Badge> : '-'}</td>
                          <td className="p-2 text-gray-500">{e.evaluator_rank ? `${e.evaluator_rank} ` : ''}{e.evaluator_name || '-'}</td>
                          <td className="p-2 text-center" onClick={ev => ev.stopPropagation()}>
                            <div className="flex justify-center gap-1">
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => { setEditingCrewEvaluation(e); setCrewEvaluationDialogOpen(true); }}><Edit2 className="h-3 w-3" /></Button>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500" onClick={() => handleDeleteEvaluation(e.id)}><Trash2 className="h-3 w-3" /></Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <EvaluationDialog
              open={crewEvaluationDialogOpen} onOpenChange={setCrewEvaluationDialogOpen} record={editingCrewEvaluation}
              lockedCrewId={id} lockedCrewName={crewDisplayName(formData)}
              onSuccess={() => loadExtendedRecords(id!)}
            />
          </TabsContent>
        )}

        {/* 상병(부상/질병) — 승선경력 탭에서 승선 건별로 등록한 것 포함, 이 선원의 모든 상병 기록을 모아 보여준다 */}
        {!isNew && (
          <TabsContent value="medical" className="mt-3 data-[state=inactive]:hidden">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">상병 기록 ({medicalRecords.length}건)</span>
                <Button type="button" variant="outline" size="sm" onClick={() => { setEditingMedical(undefined); setMedicalDialogOpen(true); }} className="h-7 text-xs gap-1"><Plus className="h-3 w-3" />추가</Button>
              </div>
              {medicalRecords.length === 0 ? (
                <div className="text-center py-6 text-sm text-gray-400 border-2 border-dashed rounded-md">등록된 상병 기록이 없습니다.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="border-b bg-gray-50">
                      <th className="text-left p-2">일자</th><th className="text-left p-2">유형</th><th className="text-left p-2">선박</th><th className="text-left p-2">진단</th><th className="text-left p-2">적합성</th><th className="text-left p-2">추적</th><th className="text-center p-2">작업</th>
                    </tr></thead>
                    <tbody>
                      {medicalRecords.map(r => (
                        <tr key={r.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => { setEditingMedical(r); setMedicalDialogOpen(true); }}>
                          <td className="p-2">{r.record_date}</td>
                          <td className="p-2">{r.record_type === 'illness' ? '질병' : '부상'}</td>
                          <td className="p-2">{r.ship_name || '-'}</td>
                          <td className="p-2 font-medium max-w-[200px] truncate">{r.diagnosis}</td>
                          <td className="p-2">
                            {r.fitness_status === 'fit' ? <Badge className="bg-green-100 text-green-700 text-xs">적합</Badge>
                              : r.fitness_status === 'fit_with_restrictions' ? <Badge className="bg-yellow-100 text-yellow-700 text-xs">조건부</Badge>
                              : r.fitness_status === 'unfit' ? <Badge className="bg-red-100 text-red-700 text-xs">부적합</Badge>
                              : r.fitness_status === 'pending' ? <Badge className="bg-gray-100 text-gray-700 text-xs">대기</Badge>
                              : '-'}
                          </td>
                          <td className="p-2">{r.follow_up_required ? <Badge className="bg-orange-100 text-orange-700 text-xs">필요</Badge> : '-'}</td>
                          <td className="p-2 text-center" onClick={ev => ev.stopPropagation()}>
                            <div className="flex justify-center gap-1">
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => { setEditingMedical(r); setMedicalDialogOpen(true); }}><Edit2 className="h-3 w-3" /></Button>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500" onClick={() => handleDeleteMedical(r.id)}><Trash2 className="h-3 w-3" /></Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <MedicalRecordDialog open={medicalDialogOpen} onOpenChange={setMedicalDialogOpen} crewId={id!} record={editingMedical} onSuccess={() => loadExtendedRecords(id!)} seaServiceRecords={seaServiceRecords} />
          </TabsContent>
        )}

        {/* 급여이력 */}
        {!isNew && (
          <TabsContent value="salary_records" className="mt-3 data-[state=inactive]:hidden">
            <Tabs value={payrollSubTab} onValueChange={v => setPayrollSubTab(v as 'onboard' | 'sick')}>
              <TabsList className="h-8">
                <TabsTrigger value="onboard" className="text-xs">
                  승선중 급여{(payrollHistory.length + salaryRecords.length) > 0 && <span className="ml-1 bg-yellow-100 text-yellow-700 rounded-full px-1.5">{payrollHistory.length + salaryRecords.length}</span>}
                </TabsTrigger>
                <TabsTrigger value="sick" className="text-xs">
                  상병 급여{sickPayHistory.length > 0 && <span className="ml-1 bg-orange-100 text-orange-700 rounded-full px-1.5">{sickPayHistory.length}</span>}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="onboard" className="mt-3 data-[state=inactive]:hidden">
                <div className="space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="text-sm font-semibold">지급된 급여명세 ({payrollHistory.length}건) <span className="text-xs text-gray-400 font-normal">— 선원 급여명세 메뉴에서 생성된 실제 급여명세, 행을 클릭하면 명세서를 볼 수 있습니다</span></span>
                      {payrollHistory.length > 0 && (
                        <div className="flex items-center gap-1.5">
                          <Select value={payrollYearFilter} onValueChange={setPayrollYearFilter}>
                            <SelectTrigger className="h-7 text-xs w-24"><SelectValue placeholder="연도" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all" className="text-xs">전체 연도</SelectItem>
                              {payrollYearOptions.map(y => <SelectItem key={y} value={y} className="text-xs">{y}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <Select value={payrollShipFilter} onValueChange={setPayrollShipFilter}>
                            <SelectTrigger className="h-7 text-xs w-32"><SelectValue placeholder="선박" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all" className="text-xs">전체 선박</SelectItem>
                              {payrollShipOptions.map(s => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                    {payrollHistory.length === 0 ? (
                      <div className="text-center py-6 text-sm text-gray-400 border-2 border-dashed rounded-md">생성된 급여명세가 없습니다.</div>
                    ) : filteredPayrollHistory.length === 0 ? (
                      <div className="text-center py-6 text-sm text-gray-400 border-2 border-dashed rounded-md">조건에 맞는 급여명세가 없습니다.</div>
                    ) : (
                      <>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead><tr className="border-b bg-gray-50">
                              <th className="text-left p-2">회차</th><th className="text-left p-2">선박</th><th className="text-left p-2">기간</th><th className="text-right p-2">근무일수</th><th className="text-right p-2">실지급액</th><th className="text-left p-2">상태</th>
                            </tr></thead>
                            <tbody>
                              {pagedPayrollHistory.map(r => (
                                <tr key={r.payslip_id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => openPayslipModal(r.payslip_id)}>
                                  <td className="p-2">{r.year_month}</td>
                                  <td className="p-2">{r.ship_name}</td>
                                  <td className="p-2">{r.period_start_date} ~ {r.period_end_date}</td>
                                  <td className="p-2 text-right">{r.days_served}/{r.days_in_month}일</td>
                                  <td className="p-2 text-right font-mono font-semibold">{r.net_amount.toLocaleString()}</td>
                                  <td className="p-2">
                                    {r.status === 'confirmed' ? <Badge className="bg-green-100 text-green-700 text-xs">확정</Badge>
                                      : r.status === 'pending_approval' ? <Badge className="bg-yellow-100 text-yellow-700 text-xs">상신중</Badge>
                                      : <Badge className="bg-gray-100 text-gray-600 text-xs">작성중</Badge>}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {payrollTotalPages > 1 && (
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-gray-400">
                              총 {filteredPayrollHistory.length}건 중 {(payrollPage - 1) * PAYROLL_PAGE_SIZE + 1}-{Math.min(payrollPage * PAYROLL_PAGE_SIZE, filteredPayrollHistory.length)}건 표시
                            </p>
                            <Pagination className="mx-0 w-auto">
                              <PaginationContent>
                                <PaginationItem><PaginationPrevious onClick={() => payrollPage > 1 && setPayrollPage(payrollPage - 1)} className={payrollPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'} /></PaginationItem>
                                {Array.from({ length: payrollTotalPages }, (_, i) => i + 1).map(p => {
                                  if (p === 1 || p === payrollTotalPages || (p >= payrollPage - 1 && p <= payrollPage + 1)) {
                                    return <PaginationItem key={p}><PaginationLink onClick={() => setPayrollPage(p)} isActive={payrollPage === p} className="cursor-pointer">{p}</PaginationLink></PaginationItem>;
                                  } else if (p === payrollPage - 2 || p === payrollPage + 2) {
                                    return <PaginationItem key={p}><span className="px-4">...</span></PaginationItem>;
                                  }
                                  return null;
                                })}
                                <PaginationItem><PaginationNext onClick={() => payrollPage < payrollTotalPages && setPayrollPage(payrollPage + 1)} className={payrollPage === payrollTotalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'} /></PaginationItem>
                              </PaginationContent>
                            </Pagination>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <div className="flex items-center justify-between border-t pt-3">
                    <span className="text-sm font-semibold">수동 등록 급여 이력 ({salaryRecords.length}건) <span className="text-xs text-gray-400 font-normal">— 직접 입력한 기록</span></span>
                    <Button type="button" variant="outline" size="sm" onClick={() => { setEditingSalary(undefined); setSalaryDialogOpen(true); }} className="h-7 text-xs gap-1"><Plus className="h-3 w-3" />추가</Button>
                  </div>
                  {salaryRecords.length === 0 ? (
                    <div className="text-center py-6 text-sm text-gray-400 border-2 border-dashed rounded-md">급여 이력을 추가하세요.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead><tr className="border-b bg-gray-50">
                          <th className="text-left p-2">기간</th><th className="text-right p-2">기본급</th><th className="text-right p-2">순수령</th><th className="text-left p-2">통화</th><th className="text-left p-2">상태</th><th className="text-center p-2">작업</th>
                        </tr></thead>
                        <tbody>
                          {salaryRecords.map(r => (
                            <tr key={r.id} className="border-b hover:bg-gray-50">
                              <td className="p-2">{r.payment_period_start} ~ {r.payment_period_end}</td>
                              <td className="p-2 text-right font-mono">{r.basic_salary.toLocaleString()}</td>
                              <td className="p-2 text-right font-mono font-semibold">{r.net_salary.toLocaleString()}</td>
                              <td className="p-2">{r.currency}</td>
                              <td className="p-2">
                                {r.payment_status === 'paid' ? <Badge className="bg-green-100 text-green-700 text-xs">지급완료</Badge>
                                  : r.payment_status === 'pending' ? <Badge className="bg-yellow-100 text-yellow-700 text-xs">대기</Badge>
                                  : <Badge className="bg-red-100 text-red-700 text-xs">취소</Badge>}
                              </td>
                              <td className="p-2 text-center">
                                <div className="flex justify-center gap-1">
                                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => { setEditingSalary(r); setSalaryDialogOpen(true); }}><Edit2 className="h-3 w-3" /></Button>
                                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500" onClick={() => handleDeleteSalary(r.id)}><Trash2 className="h-3 w-3" /></Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                <SalaryRecordDialog open={salaryDialogOpen} onOpenChange={setSalaryDialogOpen} crewId={id!} record={editingSalary} onSuccess={() => loadExtendedRecords(id!)} />
              </TabsContent>

              <TabsContent value="sick" className="mt-3 data-[state=inactive]:hidden">
                <div className="space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="text-sm font-semibold">상병급여 이력 ({sickPayHistory.length}건) <span className="text-xs text-gray-400 font-normal">— 지급된 급여명세와 동일한 방식, 행을 클릭하면 월별 내역을 볼 수 있습니다</span></span>
                    {sickPayHistory.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <Select value={sickPayHistoryYearFilter} onValueChange={setSickPayHistoryYearFilter}>
                          <SelectTrigger className="h-7 text-xs w-24"><SelectValue placeholder="연도" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all" className="text-xs">전체 연도</SelectItem>
                            {sickPayHistoryYearOptions.map(y => <SelectItem key={y} value={y} className="text-xs">{y}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Select value={sickPayHistoryShipFilter} onValueChange={setSickPayHistoryShipFilter}>
                          <SelectTrigger className="h-7 text-xs w-32"><SelectValue placeholder="선박" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all" className="text-xs">전체 선박</SelectItem>
                            {sickPayHistoryShipOptions.map(s => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                  {sickPayHistory.length === 0 ? (
                    <div className="text-center py-6 text-sm text-gray-400 border-2 border-dashed rounded-md">상병급여 이력이 없습니다.</div>
                  ) : filteredSickPayHistory.length === 0 ? (
                    <div className="text-center py-6 text-sm text-gray-400 border-2 border-dashed rounded-md">조건에 맞는 상병급여 이력이 없습니다.</div>
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead><tr className="border-b bg-gray-50">
                            <th className="text-left p-2">회차</th><th className="text-left p-2">선박</th><th className="text-left p-2">직급</th><th className="text-right p-2">금액</th><th className="text-left p-2">상태</th>
                          </tr></thead>
                          <tbody>
                            {pagedSickPayHistory.map(r => (
                              <tr key={`${r.record_id}:${r.year_month}`} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => setViewingSickPayRecordId(r.record_id)}>
                                <td className="p-2">{r.year_month}</td>
                                <td className="p-2">{r.ship_name}</td>
                                <td className="p-2">{r.rank_code}</td>
                                <td className="p-2 text-right font-mono font-semibold">{r.amount.toLocaleString()} {r.currency}</td>
                                <td className="p-2">
                                  {r.status === 'closed'
                                    ? <Badge className="bg-green-100 text-green-700 text-xs">종결</Badge>
                                    : <Badge className="bg-blue-100 text-blue-700 text-xs">진행중</Badge>}
                                  {!r.confirmed && <Badge variant="outline" className="text-[10px] ml-1 text-gray-400 border-gray-300">미확정</Badge>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {sickPayHistoryTotalPages > 1 && (
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-gray-400">
                            총 {filteredSickPayHistory.length}건 중 {(sickPayHistoryPage - 1) * SICK_PAY_PAGE_SIZE + 1}-{Math.min(sickPayHistoryPage * SICK_PAY_PAGE_SIZE, filteredSickPayHistory.length)}건 표시
                          </p>
                          <Pagination className="mx-0 w-auto">
                            <PaginationContent>
                              <PaginationItem><PaginationPrevious onClick={() => sickPayHistoryPage > 1 && setSickPayHistoryPage(sickPayHistoryPage - 1)} className={sickPayHistoryPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'} /></PaginationItem>
                              {Array.from({ length: sickPayHistoryTotalPages }, (_, i) => i + 1).map(p => {
                                if (p === 1 || p === sickPayHistoryTotalPages || (p >= sickPayHistoryPage - 1 && p <= sickPayHistoryPage + 1)) {
                                  return <PaginationItem key={p}><PaginationLink onClick={() => setSickPayHistoryPage(p)} isActive={sickPayHistoryPage === p} className="cursor-pointer">{p}</PaginationLink></PaginationItem>;
                                } else if (p === sickPayHistoryPage - 2 || p === sickPayHistoryPage + 2) {
                                  return <PaginationItem key={p}><span className="px-4">...</span></PaginationItem>;
                                }
                                return null;
                              })}
                              <PaginationItem><PaginationNext onClick={() => sickPayHistoryPage < sickPayHistoryTotalPages && setSickPayHistoryPage(sickPayHistoryPage + 1)} className={sickPayHistoryPage === sickPayHistoryTotalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'} /></PaginationItem>
                            </PaginationContent>
                          </Pagination>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </TabsContent>
        )}

        {!isNew && (
          <TabsContent value="interviews" className="mt-3 data-[state=inactive]:hidden">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">면담 일지 ({interviewLogs.length}건) <span className="text-xs text-gray-400 font-normal">— 가장 최근 면담의 승선 희망일이 기본정보에 반영됩니다</span></span>
                <Button type="button" variant="outline" size="sm" onClick={() => { setEditingInterview(undefined); setInterviewDialogOpen(true); }} className="h-7 text-xs gap-1"><Plus className="h-3 w-3" />추가</Button>
              </div>
              {interviewLogs.length === 0 ? (
                <div className="text-center py-6 text-sm text-gray-400 border-2 border-dashed rounded-md">등록된 면담 일지가 없습니다.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="border-b bg-gray-50">
                      <th className="text-left p-2">면담일</th><th className="text-left p-2">면담자</th><th className="text-left p-2">승선 희망 선주/플릿/선박</th><th className="text-left p-2">승선 희망일</th><th className="text-center p-2">작업</th>
                    </tr></thead>
                    <tbody>
                      {interviewLogs.map(log => (
                        <tr key={log.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => { setEditingInterview(log); setInterviewDialogOpen(true); }}>
                          <td className="p-2">{log.interview_date}</td>
                          <td className="p-2">{log.interviewer_name}</td>
                          <td className="p-2 text-gray-500">
                            {[log.desired_owner_name, log.desired_fleet_name, log.desired_ship_name].filter(Boolean).join(' > ') || '-'}
                          </td>
                          <td className="p-2">{log.desired_embark_date || '-'}</td>
                          <td className="p-2 text-center" onClick={ev => ev.stopPropagation()}>
                            <div className="flex justify-center gap-1">
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => { setEditingInterview(log); setInterviewDialogOpen(true); }}><Edit2 className="h-3 w-3" /></Button>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500" onClick={() => handleDeleteInterview(log.id)}><Trash2 className="h-3 w-3" /></Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <CrewInterviewDialog
              open={interviewDialogOpen} onOpenChange={setInterviewDialogOpen} record={editingInterview}
              crewId={id!}
              onSuccess={() => { loadExtendedRecords(id!); loadCrew(id!); }}
            />
          </TabsContent>
        )}
      </Tabs>

      {/* 지급된 급여명세 상세 — 새 탭 대신 모달로 보여준다. */}
      <Dialog open={payslipModalOpen} onOpenChange={o => { setPayslipModalOpen(o); if (!o) setViewingPayslip(null); }}>
        <DialogContent className="sm:max-w-[720px] max-h-[90vh] overflow-y-auto">
          <DialogTitle className="sr-only">급여명세서</DialogTitle>
          {viewingPayslipLoading ? (
            <div className="flex items-center justify-center h-32 text-sm text-gray-400">불러오는 중...</div>
          ) : viewingPayslip ? (
            <CrewPayslipDetailView payslip={viewingPayslip} shipName={viewingPayslip.ship_name} />
          ) : (
            <div className="flex items-center justify-center h-32 text-sm text-gray-400">명세서를 찾을 수 없습니다.</div>
          )}
        </DialogContent>
      </Dialog>

      {/* 상병급여 케이스 월별 내역 — 이미 불러온 sickPayHistory에서 같은 케이스만 걸러서 보여준다. */}
      <Dialog open={!!viewingSickPayRecordId} onOpenChange={o => !o && setViewingSickPayRecordId(null)}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogTitle className="text-base flex items-center gap-1.5"><Stethoscope className="w-4 h-4 text-muted-foreground" />상병급여 월별 내역</DialogTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="border-b bg-gray-50">
                <th className="text-left p-2">회차</th><th className="text-right p-2">금액</th><th className="text-left p-2">상태</th>
              </tr></thead>
              <tbody>
                {viewingSickPayEntries.map(e => (
                  <tr key={e.year_month} className="border-b">
                    <td className="p-2">{e.year_month}</td>
                    <td className="p-2 text-right font-mono">{e.amount.toLocaleString()} {e.currency}</td>
                    <td className="p-2">
                      {e.confirmed
                        ? <Badge className="bg-green-100 text-green-700 text-xs">확정</Badge>
                        : <Badge variant="outline" className="text-xs text-gray-400 border-gray-300">미확정(계산값)</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );

  const reservationBanner = crewReservations.length > 0 && (
    <div className="rounded-md border border-violet-200 bg-violet-50 px-3 py-2 space-y-1">
      {crewReservations.map((r, i) => (
        <div key={i} className="flex items-center justify-between text-xs gap-2">
          <span className="text-violet-700">
            <span className="font-medium">{r.role === 'on' ? '승선 예정' : '하선 예정'}</span>
            {' — '}{r.planName} ({r.status === 'draft' ? '임시저장' : r.status === 'pending_approval' ? '결재중' : '승인됨'})
            {r.shipName ? ` · ${r.shipName}` : ''}
          </span>
          {r.role === 'on' && r.salaryAmount != null && (
            <span className="text-violet-600 font-mono shrink-0">{r.salaryCurrency} {r.salaryAmount.toLocaleString()}</span>
          )}
        </div>
      ))}
    </div>
  );

  if (embedded) {
    return (
      <div ref={panelRef} className="space-y-4 pt-3 border-t">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-500">
            {isNew ? '새 선원 등록' : crewDisplayName(formData) || '선원 정보 수정'}
          </span>
          <Button onClick={handleSave} disabled={saving} size="sm" className="gap-1.5 h-8">
            <Save className="w-4 h-4" />
            {saving ? '저장 중...' : isNew ? '등록' : '저장'}
          </Button>
        </div>
        {reservationBanner}
        {formBody}
      </div>
    );
  }

  return (
    <div ref={panelRef} className="max-w-[1600px] mx-auto px-3 sm:px-4 lg:px-6 py-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}>
                <X className="w-4 h-4" />
              </Button>
              <div>
                <CardTitle className="text-base">
                  {isNew ? '선원 등록' : '선원 카드'}
                </CardTitle>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!isNew && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 h-8 text-blue-700 border-blue-300 hover:bg-blue-50"
                  onClick={() => window.open(`/print/crew/${id}/resume`, '_blank')}
                >
                  <FileText className="w-4 h-4" />
                  이력서 출력
                </Button>
              )}
              <Button onClick={handleSave} disabled={saving} size="sm" className="gap-1.5 h-8">
                <Save className="w-4 h-4" />
                {saving ? '저장 중...' : isNew ? '등록' : '저장'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          {reservationBanner}
          {formBody}
        </CardContent>
      </Card>
    </div>
  );
}
