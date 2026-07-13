import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Save, Upload, User, X, Plus, Trash2, FileText, Edit2, Star, Stethoscope } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import { sortRanksByDisplayOrder } from '@/lib/rank-order';
import { useToast } from '@/hooks/use-toast';
import { rotationService, type CrewReservation } from '@/services/rotation.service';
import { getNationalities } from '@/services/nationality.service';
import { getCertificateTypes } from '@/services/certificate-type.service';
import { getCertificateCategories } from '@/services/certificate-category.service';
import type { Nationality } from '@/types/nationality';
import type { CertificateType } from '@/types/certificate-type';
import type { CertificateCategory } from '@/types/certificate-category';
import CrewStatusBadge from '@/components/crew/CrewStatusBadge';
import SeaServiceDialog from '@/components/crew/SeaServiceDialog';
import SeaServiceEvaluationDialog from '@/components/crew/SeaServiceEvaluationDialog';
import SeaServiceMedicalDialog from '@/components/crew/SeaServiceMedicalDialog';
import EvaluationDialog from '@/components/crew/EvaluationDialog';
import { getEvaluations, deleteEvaluation } from '@/services/evaluation.service';
import type { CrewEvaluationWithDetails } from '@/types/evaluation';
import TrainingRecordDialog from '@/components/crew/TrainingRecordDialog';
import MedicalRecordDialog from '@/components/crew/MedicalRecordDialog';
import SalaryRecordDialog from '@/components/crew/SalaryRecordDialog';
import {
  getSeaServiceRecords, deleteSeaServiceRecord,
  getTrainingRecords, deleteTrainingRecord,
  getMedicalRecords, deleteMedicalRecord,
  getCrewSalaryRecords, deleteCrewSalaryRecord,
} from '@/services/crew-extended.service';
import type { SeaServiceRecord, TrainingRecord, MedicalRecord, CrewSalaryRecord } from '@/types/crew-extended';

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
  rank_id: '', nationality: '', date_of_birth: '',
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
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [certFiles, setCertFiles] = useState<Record<number, File>>({});
  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContact[]>([]);
  const [crewStatus, setCrewStatus] = useState('registered');
  // 이 선원이 현재 배정되어 있는 활성(임시저장/결재중/승인) 교대계획 — 승선 예정/하선 예정 모두 포함
  const [crewReservations, setCrewReservations] = useState<CrewReservation[]>([]);
  const [formData, setFormData] = useState(EMPTY_FORM);

  const [seaServiceRecords, setSeaServiceRecords] = useState<SeaServiceRecord[]>([]);
  const [evaluations, setEvaluations] = useState<CrewEvaluationWithDetails[]>([]);
  const [evaluationCounts, setEvaluationCounts] = useState<Record<string, number>>({});
  const [trainingRecords, setTrainingRecords] = useState<TrainingRecord[]>([]);
  const [medicalRecords, setMedicalRecords] = useState<MedicalRecord[]>([]);
  const [medicalCounts, setMedicalCounts] = useState<Record<string, number>>({});
  const [salaryRecords, setSalaryRecords] = useState<CrewSalaryRecord[]>([]);
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

  useEffect(() => {
    supabase.from('ranks').select('*').then(({ data }) => { if (data) setRanks(sortRanksByDisplayOrder(data)); });
    getNationalities(true).then(setNationalities).catch(console.error);
    getCertificateTypes(true).then(setCertificateTypes).catch(console.error);
    getCertificateCategories(true).then(setCertificateCategories).catch(console.error);
    if (!isNew) loadCrew(id!);
    else {
      setLoading(false);
      setFormData(EMPTY_FORM);
      setPreviewUrl('');
      setCertificates([]);
      setEmergencyContacts([]);
      setCrewStatus('registered');
    }
  }, [id]);

  const loadCrew = async (crewId: string) => {
    try {
      setLoading(true);
      const { data, error } = await supabase.from('crew_members').select('*').eq('id', crewId).single();
      if (error) throw error;
      if (!data) { toast({ title: '선원을 찾을 수 없습니다.', variant: 'destructive' }); onBack(); return; }

      setCrewStatus(data.current_status || data.status || 'registered');
      rotationService.getCrewReservationsByIds([crewId]).then(map => setCrewReservations(map.get(crewId) || []));
      setFormData({
        name: data.name || '',
        name_english: data.name_english || '',
        name_chinese: data.name_chinese || '',
        rank_id: data.rank_id || '',
        nationality: data.nationality || '',
        date_of_birth: data.date_of_birth || '',
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
      const [sea, train, med, sal, evals] = await Promise.all([
        getSeaServiceRecords(crewId),
        getTrainingRecords(crewId),
        getMedicalRecords(crewId),
        getCrewSalaryRecords(crewId),
        getEvaluations(crewId),
      ]);
      setSeaServiceRecords(sea);
      setTrainingRecords(train);
      setMedicalRecords(med);
      setSalaryRecords(sal);
      setEvaluations(evals);
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
    if (!formData.name || !formData.rank_id) {
      toast({ title: '필수 항목 누락', description: '이름과 직급은 필수입니다.', variant: 'destructive' });
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const formBody = (
    <>
      {/* 사진 */}
      <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
        <div className="relative">
          {previewUrl ? (
            <div className="relative">
              <img
                src={previewUrl}
                alt=""
                className="w-16 h-16 rounded-full object-cover border-2 border-gray-200 cursor-pointer hover:opacity-80"
                onClick={() => setPhotoModalOpen(true)}
              />
              <button type="button" onClick={() => { setSelectedFile(null); setPreviewUrl(''); f('photo_url', ''); }} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5">
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center border-2 border-gray-200">
              <User className="w-8 h-8 text-gray-400" />
            </div>
          )}
        </div>
        <div>
          <Label htmlFor="photo-input" className="cursor-pointer">
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border rounded-md hover:bg-gray-50 text-xs">
              <Upload className="w-3.5 h-3.5" />사진 업로드
            </div>
          </Label>
          <Input id="photo-input" type="file" accept="image/jpeg,image/jpg,image/png,image/webp" onChange={handleFileSelect} className="hidden" />
          <p className="text-xs text-gray-400 mt-1">JPG, PNG, WEBP · 최대 5MB</p>
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
          <TabsList className="grid w-full grid-cols-5 h-8">
            <TabsTrigger value="basic" className="text-xs">기본정보</TabsTrigger>
            <TabsTrigger value="biodata" className="text-xs">Bio-Data</TabsTrigger>
            <TabsTrigger value="lang_health" className="text-xs">언어/건강</TabsTrigger>
            <TabsTrigger value="emergency" className="text-xs">연락처</TabsTrigger>
            <TabsTrigger value="certificates" className="text-xs">
              증서{certificates.length > 0 && <span className="ml-1 bg-blue-100 text-blue-700 rounded-full px-1.5">{certificates.length}</span>}
            </TabsTrigger>
          </TabsList>
          {!isNew && (
            <TabsList className="grid w-full grid-cols-5 h-8">
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
                상병{medicalRecords.length > 0 && <span className="ml-1 bg-orange-100 text-orange-700 rounded-full px-1.5">{medicalRecords.length}</span>}
              </TabsTrigger>
              <TabsTrigger value="salary_records" className="text-xs">
                급여이력{salaryRecords.length > 0 && <span className="ml-1 bg-yellow-100 text-yellow-700 rounded-full px-1.5">{salaryRecords.length}</span>}
              </TabsTrigger>
            </TabsList>
          )}
        </div>

        {/* 기본 정보 */}
        <TabsContent value="basic" className="space-y-3 mt-3 data-[state=inactive]:hidden">
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">이름 (한국어) *</Label><Input value={formData.name} onChange={e => f('name', e.target.value)} className="mt-1 h-9" placeholder="홍길동" /></div>
            <div><Label className="text-xs">이름 (영문)</Label><Input value={formData.name_english} onChange={e => f('name_english', e.target.value)} className="mt-1 h-9" placeholder="HONG GIL DONG" /></div>
            <div><Label className="text-xs">이름 (한자)</Label><Input value={formData.name_chinese} onChange={e => f('name_chinese', e.target.value)} className="mt-1 h-9" placeholder="洪吉童" /></div>
            <div>
              <Label className="text-xs">직급 *</Label>
              <Select value={formData.rank_id} onValueChange={v => f('rank_id', v)}>
                <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="직급 선택" /></SelectTrigger>
                <SelectContent>{ranks.map(r => <SelectItem key={r.id} value={r.id}>{r.name} ({r.rank_code})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">국적</Label>
              <Select value={formData.nationality} onValueChange={v => f('nationality', v)}>
                <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="국적 선택" /></SelectTrigger>
                <SelectContent>{nationalities.map(n => <SelectItem key={n.id} value={n.country_code}>{n.country_name_ko} ({n.country_code})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">생년월일{formData.date_of_birth && <span className="text-gray-400 font-normal"> (만 {calculateAge(formData.date_of_birth)}세)</span>}</Label>
              <Input type="date" value={formData.date_of_birth} onChange={e => f('date_of_birth', e.target.value)} className="mt-1 h-9" />
            </div>
            <div><Label className="text-xs">연락처</Label><Input value={formData.contact_phone} onChange={e => f('contact_phone', e.target.value)} className="mt-1 h-9" /></div>
            <div><Label className="text-xs">이메일</Label><Input type="email" value={formData.contact_email} onChange={e => f('contact_email', e.target.value)} className="mt-1 h-9" /></div>
          </div>

          <div className="border-t pt-3">
            <p className="text-xs font-semibold text-gray-600 mb-2">서류 번호</p>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">여권 번호</Label><Input value={formData.passport_number} onChange={e => f('passport_number', e.target.value)} className="mt-1 h-9" placeholder="M12345678" /></div>
              <div><Label className="text-xs">여권 만료일</Label><Input type="date" value={formData.passport_expiry} onChange={e => f('passport_expiry', e.target.value)} className="mt-1 h-9" /></div>
              <div><Label className="text-xs">선원수첩 (국내) 번호</Label><Input value={formData.seaman_book_number} onChange={e => f('seaman_book_number', e.target.value)} className="mt-1 h-9" /></div>
              <div><Label className="text-xs">선원수첩 (국내) 만료일</Label><Input type="date" value={formData.seaman_book_expiry} onChange={e => f('seaman_book_expiry', e.target.value)} className="mt-1 h-9" /></div>
              <div><Label className="text-xs">선원수첩 (국제/Flag) 번호</Label><Input value={formData.seaman_book_flag_number} onChange={e => f('seaman_book_flag_number', e.target.value)} className="mt-1 h-9" /></div>
              <div><Label className="text-xs">선원수첩 (국제/Flag) 만료일</Label><Input type="date" value={formData.seaman_book_flag_expiry} onChange={e => f('seaman_book_flag_expiry', e.target.value)} className="mt-1 h-9" /></div>
              <div><Label className="text-xs">SID (선원 ID)</Label><Input value={formData.sid} onChange={e => f('sid', e.target.value)} className="mt-1 h-9" /></div>
            </div>
          </div>
        </TabsContent>

        {/* Bio-Data */}
        <TabsContent value="biodata" className="space-y-3 mt-3 data-[state=inactive]:hidden">
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
        </TabsContent>

        {/* 언어/건강 */}
        <TabsContent value="lang_health" className="space-y-3 mt-3 data-[state=inactive]:hidden">
          <p className="text-xs font-semibold text-gray-600">언어 능력</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">영어 - 읽기/쓰기</Label>
              <Select value={formData.english_read_write} onValueChange={v => f('english_read_write', v)}>
                <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="수준 선택" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">선택 안함</SelectItem>
                  {ENGLISH_LEVELS.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">영어 - 말하기/듣기</Label>
              <Select value={formData.english_speak_listen} onValueChange={v => f('english_speak_listen', v)}>
                <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="수준 선택" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">선택 안함</SelectItem>
                  {ENGLISH_LEVELS.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label className="text-xs">기타 언어</Label>
              <Input value={formData.other_languages} onChange={e => f('other_languages', e.target.value)} className="mt-1 h-9" placeholder="예: 인도네시아어 (중급), 일본어 (초급)" />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">업무 능력 평가</Label>
              <Textarea value={formData.job_ability} onChange={e => f('job_ability', e.target.value)} className="mt-1 text-sm" rows={2} placeholder="업무 능력 및 경력 특이사항" />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">지원 동기</Label>
              <Textarea value={formData.motivation} onChange={e => f('motivation', e.target.value)} className="mt-1 text-sm" rows={2} placeholder="승선 지원 동기" />
            </div>
          </div>

          <div className="border-t pt-3">
            <p className="text-xs font-semibold text-gray-600 mb-2">건강 / 신체검사</p>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">약물/알코올 검사일</Label><Input type="date" value={formData.drug_test_date} onChange={e => f('drug_test_date', e.target.value)} className="mt-1 h-9" /></div>
              <div>
                <Label className="text-xs">약물/알코올 검사 결과</Label>
                <Select value={formData.drug_test_result} onValueChange={v => f('drug_test_result', v)}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">선택 안함</SelectItem>
                    <SelectItem value="pass">합격 (Pass)</SelectItem>
                    <SelectItem value="fail">불합격 (Fail)</SelectItem>
                    <SelectItem value="pending">대기 중</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">신체검사일</Label><Input type="date" value={formData.physical_exam_date} onChange={e => f('physical_exam_date', e.target.value)} className="mt-1 h-9" /></div>
              <div>
                <Label className="text-xs">신체검사 결과</Label>
                <Select value={formData.physical_exam_result} onValueChange={v => f('physical_exam_result', v)}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">선택 안함</SelectItem>
                    <SelectItem value="fit">적합 (Fit)</SelectItem>
                    <SelectItem value="unfit">부적합 (Unfit)</SelectItem>
                    <SelectItem value="pending">대기 중</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">황열병 예방접종</Label>
                <Select value={formData.yellow_fever_vaccination} onValueChange={v => f('yellow_fever_vaccination', v)}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">선택 안함</SelectItem>
                    <SelectItem value="yes">접종 완료</SelectItem>
                    <SelectItem value="no">미접종</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">황열병 접종일</Label><Input type="date" value={formData.yellow_fever_date} onChange={e => f('yellow_fever_date', e.target.value)} className="mt-1 h-9" disabled={formData.yellow_fever_vaccination !== 'yes'} /></div>
              <div className="col-span-2">
                <Label className="text-xs">기왕증 (과거 병력)</Label>
                <Textarea value={formData.previous_illness} onChange={e => f('previous_illness', e.target.value)} className="mt-1 text-sm" rows={2} placeholder="과거 질병, 수술, 특이 병력 등" />
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
                      number: '', issued_date: '', expiry_date: '', issuing_authority: '', no_expiry: !ct.validity_period_months,
                    }));
                    setCertificates(newCerts);
                  }} className="h-8 text-xs gap-1"><Plus className="h-3 w-3" />전체 증서 불러오기</Button>
                )}
                {certificateTypes.length > 0 && certificates.length > 0 && (
                  <Button type="button" variant="outline" size="sm" onClick={() => {
                    const existingNames = new Set(certificates.map(c => c.name));
                    const newCerts = certificateTypes
                      .filter(ct => !existingNames.has(`${ct.type_name_en}`))
                      .map(ct => ({ name: `${ct.type_name_en}`, number: '', issued_date: '', expiry_date: '', issuing_authority: '', no_expiry: !ct.validity_period_months }));
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
                      number: '', issued_date: '', expiry_date: '', issuing_authority: '', no_expiry: !ct.validity_period_months,
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
                      <th className="text-left p-2">선주사</th><th className="text-left p-2">선박관리사</th><th className="text-left p-2">매닝사</th><th className="text-left p-2">선박명</th><th className="text-left p-2">직급</th><th className="text-left p-2">승선일</th><th className="text-left p-2">하선일</th><th className="text-left p-2">하선사유</th><th className="text-left p-2">유형</th><th className="text-center p-2">고과</th><th className="text-center p-2">상병</th><th className="text-center p-2">작업</th>
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
                                <Stethoscope className="h-3 w-3" />상병 {medicalCounts[r.id]}건
                              </Button>
                            ) : (
                              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1 text-gray-400" onClick={() => { setSeaServiceMedicalDialogRecord(r); setSeaServiceMedicalDialogOpen(true); }}>
                                <Stethoscope className="h-3 w-3" />상병
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
              lockedCrewId={id} lockedCrewName={formData.name}
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
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">급여 이력 ({salaryRecords.length}건)</span>
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
        )}
      </Tabs>
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
          <div className="flex items-center gap-2">
            {selectedRank && <Badge variant="outline" className="text-xs">{selectedRank.rank_code}</Badge>}
            {!isNew && <CrewStatusBadge status={crewStatus} />}
            <span className="text-sm font-medium text-gray-700">
              {isNew ? '새 선원 등록' : formData.name || '선원 정보 수정'}
            </span>
          </div>
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
    <div ref={panelRef} className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}>
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div>
                <CardTitle className="text-base">
                  {isNew ? '선원 등록' : formData.name || '선원 정보'}
                </CardTitle>
                <div className="flex items-center gap-2 mt-0.5">
                  {selectedRank && <Badge variant="outline" className="text-xs">{selectedRank.rank_code}</Badge>}
                  {!isNew && <CrewStatusBadge status={crewStatus} />}
                </div>
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
