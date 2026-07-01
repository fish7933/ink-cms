import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/supabase';
import type { Rank } from '@/types/models';
import { Upload, User, X, Plus, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getNationalities } from '@/services/nationality.service';
import type { Nationality } from '@/types/nationality';

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

interface CrewMember {
  id: string;
  name?: string;
  name_english?: string;
  name_chinese?: string;
  rank_id?: string;
  rank?: string;
  nationality?: string;
  date_of_birth?: string;
  contact_phone?: string;
  contact_email?: string;
  current_status?: string;
  photo_url?: string;
  // Bio-Data
  height?: number;
  weight?: number;
  blood_type?: string;
  shoe_size?: string;
  coverall_size?: string;
  clothing_size?: string;
  eye_color?: string;
  place_of_birth?: string;
  religion?: string;
  smoking?: boolean;
  drinking?: boolean;
  marital_status?: string;
  children_count?: number;
  // Language
  english_read_write?: string;
  english_speak_listen?: string;
  other_languages?: string;
  job_ability?: string;
  motivation?: string;
  // Health
  previous_illness?: string;
  drug_test_date?: string;
  drug_test_result?: string;
  physical_exam_date?: string;
  physical_exam_result?: string;
  yellow_fever_vaccination?: boolean;
  yellow_fever_date?: string;
  // Documents
  passport_number?: string;
  passport_expiry?: string;
  seaman_book_number?: string;
  seaman_book_expiry?: string;
  seaman_book_flag_number?: string;
  seaman_book_flag_expiry?: string;
  sid?: string;
  // Relations
  emergency_contacts?: EmergencyContact[];
  certificates?: Certificate[];
  rank_name?: string;
  rank_code?: string;
  ship_name?: string;
  owner_name?: string;
  fleet_name?: string;
  manning_agency_name?: string;
  age?: number;
  [key: string]: unknown;
}

interface CrewFormDialogProps {
  crew: CrewMember | null;
  onClose: (saved: boolean, crewId?: string) => void;
}

const CERT_TEMPLATES = [
  'Passport',
  'Seaman\'s Book (CDC) - National',
  'Seaman\'s Book (CDC) - Flag/Marshall',
  'STCW Basic Safety Training (BST)',
  'STCW Advanced Fire Fighting (AFF)',
  'STCW Medical First Aid (MFA)',
  'STCW Medical Care on Board (MC)',
  'STCW Proficiency in Survival Craft & Rescue Boats (SCRB)',
  'Officer of the Watch (OOW Navigation)',
  'Officer of the Watch (OOW Engineering)',
  'Chief Mate Certificate',
  'Master Certificate',
  'Second Engineer Certificate',
  'Chief Engineer Certificate',
  'GMDSS General Operator Certificate (GOC)',
  'ARPA Certificate',
  'Radar Observer Certificate',
  'Ship Security Officer (SSO)',
  'ISM Code Certificate',
  'Bridge Resource Management (BRM)',
  'ECDIS Generic Certificate',
  'ECDIS Type-Specific Certificate',
  'Ship\'s Cook Certificate',
  'Watch Keeping Certificate (Rating)',
  'Certificate of Proficiency for Ratings',
  'Medical Fitness Certificate',
  'Yellow Fever Vaccination Certificate',
  'Panama Endorsement',
];

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
  // Bio-Data
  height: '', weight: '', blood_type: 'none',
  shoe_size: '', coverall_size: '', clothing_size: '',
  eye_color: '', place_of_birth: '', religion: '',
  smoking: 'none', drinking: 'none',
  marital_status: 'none', children_count: '',
  // Language
  english_read_write: 'none', english_speak_listen: 'none',
  other_languages: '', job_ability: '', motivation: '',
  // Health
  previous_illness: '',
  drug_test_date: '', drug_test_result: 'none',
  physical_exam_date: '', physical_exam_result: 'none',
  yellow_fever_vaccination: 'none', yellow_fever_date: '',
  // Documents
  passport_number: '', passport_expiry: '',
  seaman_book_number: '', seaman_book_expiry: '',
  seaman_book_flag_number: '', seaman_book_flag_expiry: '',
  sid: '',
};

export function CrewFormDialog({ crew, onClose }: CrewFormDialogProps) {
  const { toast } = useToast();
  const formRef = useRef<HTMLDivElement>(null);
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [nationalities, setNationalities] = useState<Nationality[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [certFiles, setCertFiles] = useState<Record<number, File>>({});
  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContact[]>([]);
  const [formData, setFormData] = useState(EMPTY_FORM);

  useEffect(() => {
    supabase.from('ranks').select('*').order('display_order').then(({ data }) => { if (data) setRanks(data); });
    getNationalities(true).then(setNationalities).catch(console.error);
    setSelectedFile(null);
    setCertFiles({});

    if (crew) {
      setFormData({
        name: crew.name || '',
        name_english: crew.name_english || '',
        name_chinese: crew.name_chinese || '',
        rank_id: crew.rank_id || '',
        nationality: crew.nationality || '',
        date_of_birth: crew.date_of_birth || '',
        contact_phone: (crew.contact_phone as string) || '',
        contact_email: (crew.contact_email as string) || '',
        photo_url: (crew.photo_url as string) || '',
        height: crew.height?.toString() || '',
        weight: crew.weight?.toString() || '',
        blood_type: (crew.blood_type as string) || 'none',
        shoe_size: (crew.shoe_size as string) || '',
        coverall_size: (crew.coverall_size as string) || '',
        clothing_size: (crew.clothing_size as string) || '',
        eye_color: (crew.eye_color as string) || '',
        place_of_birth: (crew.place_of_birth as string) || '',
        religion: (crew.religion as string) || '',
        smoking: crew.smoking === true ? 'yes' : crew.smoking === false ? 'no' : 'none',
        drinking: crew.drinking === true ? 'yes' : crew.drinking === false ? 'no' : 'none',
        marital_status: (crew.marital_status as string) || 'none',
        children_count: crew.children_count?.toString() || '',
        english_read_write: (crew.english_read_write as string) || 'none',
        english_speak_listen: (crew.english_speak_listen as string) || 'none',
        other_languages: (crew.other_languages as string) || '',
        job_ability: (crew.job_ability as string) || '',
        motivation: (crew.motivation as string) || '',
        previous_illness: (crew.previous_illness as string) || '',
        drug_test_date: (crew.drug_test_date as string) || '',
        drug_test_result: (crew.drug_test_result as string) || 'none',
        physical_exam_date: (crew.physical_exam_date as string) || '',
        physical_exam_result: (crew.physical_exam_result as string) || 'none',
        yellow_fever_vaccination: crew.yellow_fever_vaccination === true ? 'yes' : crew.yellow_fever_vaccination === false ? 'no' : 'none',
        yellow_fever_date: (crew.yellow_fever_date as string) || '',
        passport_number: (crew.passport_number as string) || '',
        passport_expiry: (crew.passport_expiry as string) || '',
        seaman_book_number: (crew.seaman_book_number as string) || '',
        seaman_book_expiry: (crew.seaman_book_expiry as string) || '',
        seaman_book_flag_number: (crew.seaman_book_flag_number as string) || '',
        seaman_book_flag_expiry: (crew.seaman_book_flag_expiry as string) || '',
        sid: (crew.sid as string) || '',
      });
      setPreviewUrl((crew.photo_url as string) || '');
      try {
        const certs = typeof crew.certificates === 'string'
          ? JSON.parse(crew.certificates) : (crew.certificates || []);
        setCertificates(Array.isArray(certs) ? certs : []);
      } catch { setCertificates([]); }
      try {
        const contacts = typeof crew.emergency_contacts === 'string'
          ? JSON.parse(crew.emergency_contacts as string) : (crew.emergency_contacts || []);
        setEmergencyContacts(Array.isArray(contacts) ? contacts : []);
      } catch { setEmergencyContacts([]); }
    } else {
      setFormData(EMPTY_FORM);
      setPreviewUrl('');
      setCertificates([]);
      setEmergencyContacts([]);
    }
  }, [crew]);

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

  const scrollToTop = useCallback(() => {
    if (!formRef.current) return;
    let el: Element | null = formRef.current.parentElement;
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

  const parseBool = (val: string): boolean | null => val === 'yes' ? true : val === 'no' ? false : null;
  const parseOptional = (val: string): string | null => (val && val !== 'none') ? val : null;

  const handleSave = async () => {
    if (!formData.name || !formData.rank_id) {
      toast({ title: '필수 항목 누락', description: '이름과 직급은 필수 항목입니다.', variant: 'destructive' });
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
        // Bio-Data
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
        // Language
        english_read_write: parseOptional(formData.english_read_write),
        english_speak_listen: parseOptional(formData.english_speak_listen),
        other_languages: formData.other_languages || null,
        job_ability: formData.job_ability || null,
        motivation: formData.motivation || null,
        // Health
        previous_illness: formData.previous_illness || null,
        drug_test_date: formData.drug_test_date || null,
        drug_test_result: parseOptional(formData.drug_test_result),
        physical_exam_date: formData.physical_exam_date || null,
        physical_exam_result: parseOptional(formData.physical_exam_result),
        yellow_fever_vaccination: parseBool(formData.yellow_fever_vaccination),
        yellow_fever_date: formData.yellow_fever_date || null,
        // Documents
        passport_number: formData.passport_number || null,
        passport_expiry: formData.passport_expiry || null,
        seaman_book_number: formData.seaman_book_number || null,
        seaman_book_expiry: formData.seaman_book_expiry || null,
        seaman_book_flag_number: formData.seaman_book_flag_number || null,
        seaman_book_flag_expiry: formData.seaman_book_flag_expiry || null,
        sid: formData.sid || null,
        // JSON
        emergency_contacts: emergencyContacts.filter(c => c.name || c.phone),
        certificates: certsWithFiles,
        updated_at: new Date().toISOString(),
      };

      if (crew) {
        const { error } = await supabase.from('crew_members').update(updateData).eq('id', crew.id);
        if (error) throw new Error(error.message);
        toast({ title: '수정 완료', description: '선원 정보가 수정되었습니다.' });
        onClose(true, crew.id);
      } else {
        const { data: newCrew, error } = await supabase
          .from('crew_members')
          .insert({ ...updateData, current_status: 'registered', created_at: new Date().toISOString() })
          .select().single();
        if (error) throw new Error(error.message);
        toast({ title: '등록 완료', description: '선원이 등록되었습니다.' });
        onClose(true, newCrew?.id);
      }
    } catch (error) {
      console.error('Failed to save:', error);
      toast({ title: '저장 실패', description: String(error instanceof Error ? error.message : error), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div ref={formRef}>
        {crew && (
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            {previewUrl ? (
              <img src={previewUrl} alt="" className="w-12 h-12 rounded-full object-cover border-2 border-gray-200" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
                <User className="w-6 h-6 text-gray-400" />
              </div>
            )}
            <div>
              <div className="font-semibold text-sm">{crew.name}</div>
              <div className="text-xs text-gray-500">{crew.rank_code} · {crew.rank_name}</div>
            </div>
          </div>
        )}

        <Tabs defaultValue="basic" className="w-full" onValueChange={scrollToTop}>
          <TabsList className="grid w-full grid-cols-5 h-9">
            <TabsTrigger value="basic" className="text-xs">기본정보</TabsTrigger>
            <TabsTrigger value="biodata" className="text-xs">Bio-Data</TabsTrigger>
            <TabsTrigger value="lang_health" className="text-xs">언어/건강</TabsTrigger>
            <TabsTrigger value="emergency" className="text-xs">연락처</TabsTrigger>
            <TabsTrigger value="certificates" className="text-xs">
              증서{certificates.length > 0 && <span className="ml-1 bg-blue-100 text-blue-700 rounded-full px-1.5 text-xs">{certificates.length}</span>}
            </TabsTrigger>
          </TabsList>

          {/* 기본 정보 */}
          <TabsContent value="basic" className="space-y-4 mt-4 data-[state=inactive]:hidden">
            <div className="flex flex-col items-center space-y-2 pb-4 border-b">
              <div className="relative">
                {previewUrl ? (
                  <div className="relative">
                    <img src={previewUrl} alt="" className="w-24 h-24 rounded-full object-cover border-4 border-gray-200" />
                    <button type="button" onClick={() => { setSelectedFile(null); setPreviewUrl(''); f('photo_url', ''); }} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-1 hover:bg-red-600">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <div className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center border-4 border-gray-200">
                    <User className="w-12 h-12 text-gray-400" />
                  </div>
                )}
              </div>
              <Label htmlFor="photo-input" className="cursor-pointer">
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 rounded-md hover:bg-gray-200 text-sm">
                  <Upload className="w-3.5 h-3.5" />사진 업로드
                </div>
              </Label>
              <Input id="photo-input" type="file" accept="image/jpeg,image/jpg,image/png,image/webp" onChange={handleFileSelect} className="hidden" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">이름 (한국어) *</Label><Input value={formData.name} onChange={e => f('name', e.target.value)} className="mt-1" placeholder="홍길동" /></div>
              <div><Label className="text-xs">이름 (영문)</Label><Input value={formData.name_english} onChange={e => f('name_english', e.target.value)} className="mt-1" placeholder="HONG GIL DONG" /></div>
              <div><Label className="text-xs">이름 (한자)</Label><Input value={formData.name_chinese} onChange={e => f('name_chinese', e.target.value)} className="mt-1" placeholder="洪吉童" /></div>
              <div>
                <Label className="text-xs">직급 *</Label>
                <Select value={formData.rank_id} onValueChange={v => f('rank_id', v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="직급 선택" /></SelectTrigger>
                  <SelectContent>{ranks.map(r => <SelectItem key={r.id} value={String(r.id)}>{r.name} ({r.rank_code})</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">국적</Label>
                <Select value={formData.nationality} onValueChange={v => f('nationality', v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="국적 선택" /></SelectTrigger>
                  <SelectContent>{nationalities.map(n => <SelectItem key={n.id} value={n.country_code}>{n.country_name_ko} ({n.country_code})</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">생년월일</Label><Input type="date" value={formData.date_of_birth} onChange={e => f('date_of_birth', e.target.value)} className="mt-1" /></div>
              <div><Label className="text-xs">연락처</Label><Input value={formData.contact_phone} onChange={e => f('contact_phone', e.target.value)} className="mt-1" /></div>
              <div><Label className="text-xs">이메일</Label><Input type="email" value={formData.contact_email} onChange={e => f('contact_email', e.target.value)} className="mt-1" /></div>
            </div>

            <div className="border-t pt-3">
              <p className="text-xs font-semibold text-gray-600 mb-2">서류 번호</p>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">여권 번호</Label><Input value={formData.passport_number} onChange={e => f('passport_number', e.target.value)} className="mt-1" placeholder="M12345678" /></div>
                <div><Label className="text-xs">여권 만료일</Label><Input type="date" value={formData.passport_expiry} onChange={e => f('passport_expiry', e.target.value)} className="mt-1" /></div>
                <div><Label className="text-xs">선원수첩 (국내) 번호</Label><Input value={formData.seaman_book_number} onChange={e => f('seaman_book_number', e.target.value)} className="mt-1" /></div>
                <div><Label className="text-xs">선원수첩 (국내) 만료일</Label><Input type="date" value={formData.seaman_book_expiry} onChange={e => f('seaman_book_expiry', e.target.value)} className="mt-1" /></div>
                <div><Label className="text-xs">선원수첩 (국제/Flag) 번호</Label><Input value={formData.seaman_book_flag_number} onChange={e => f('seaman_book_flag_number', e.target.value)} className="mt-1" /></div>
                <div><Label className="text-xs">선원수첩 (국제/Flag) 만료일</Label><Input type="date" value={formData.seaman_book_flag_expiry} onChange={e => f('seaman_book_flag_expiry', e.target.value)} className="mt-1" /></div>
                <div><Label className="text-xs">SID (선원 ID)</Label><Input value={formData.sid} onChange={e => f('sid', e.target.value)} className="mt-1" /></div>
              </div>
            </div>
          </TabsContent>

          {/* Bio-Data */}
          <TabsContent value="biodata" className="space-y-4 mt-4 data-[state=inactive]:hidden">
            <p className="text-xs font-semibold text-gray-600">신체 정보</p>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">출생지</Label><Input value={formData.place_of_birth} onChange={e => f('place_of_birth', e.target.value)} className="mt-1" placeholder="예: Jakarta, Indonesia" /></div>
              <div>
                <Label className="text-xs">혈액형</Label>
                <Select value={formData.blood_type} onValueChange={v => f('blood_type', v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">선택 안함</SelectItem>
                    {['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">키 (cm)</Label><Input type="number" value={formData.height} onChange={e => f('height', e.target.value)} className="mt-1" placeholder="170" /></div>
              <div><Label className="text-xs">몸무게 (kg)</Label><Input type="number" value={formData.weight} onChange={e => f('weight', e.target.value)} className="mt-1" placeholder="70" /></div>
              <div>
                <Label className="text-xs">눈 색</Label>
                <Select value={formData.eye_color || '_none'} onValueChange={v => f('eye_color', v === '_none' ? '' : v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="눈 색 선택" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">선택 안함</SelectItem>
                    {EYE_COLORS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">신발 사이즈 (mm)</Label>
                <Select value={formData.shoe_size} onValueChange={v => f('shoe_size', v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="신발 사이즈" /></SelectTrigger>
                  <SelectContent>{SHOE_SIZES.map(s => <SelectItem key={s} value={s}>{s} mm</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">작업복 사이즈</Label>
                <Select value={formData.coverall_size} onValueChange={v => f('coverall_size', v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="작업복 사이즈" /></SelectTrigger>
                  <SelectContent>{COVERALL_SIZES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">의류 사이즈</Label>
                <Select value={formData.clothing_size} onValueChange={v => f('clothing_size', v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="의류 사이즈" /></SelectTrigger>
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
                    <SelectTrigger className="mt-1"><SelectValue placeholder="종교 선택" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">선택 안함</SelectItem>
                      {RELIGIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">결혼 여부</Label>
                  <Select value={formData.marital_status} onValueChange={v => f('marital_status', v)}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="선택" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">선택 안함</SelectItem>
                      {MARITAL_STATUSES.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs">자녀 수</Label><Input type="number" min="0" value={formData.children_count} onChange={e => f('children_count', e.target.value)} className="mt-1" placeholder="0" /></div>
                <div />
                <div>
                  <Label className="text-xs">흡연</Label>
                  <Select value={formData.smoking} onValueChange={v => f('smoking', v)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
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
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
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
          <TabsContent value="lang_health" className="space-y-4 mt-4 data-[state=inactive]:hidden">
            <p className="text-xs font-semibold text-gray-600">언어 능력</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">영어 - 읽기/쓰기</Label>
                <Select value={formData.english_read_write} onValueChange={v => f('english_read_write', v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="수준 선택" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">선택 안함</SelectItem>
                    {ENGLISH_LEVELS.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">영어 - 말하기/듣기</Label>
                <Select value={formData.english_speak_listen} onValueChange={v => f('english_speak_listen', v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="수준 선택" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">선택 안함</SelectItem>
                    {ENGLISH_LEVELS.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label className="text-xs">기타 언어</Label>
                <Input value={formData.other_languages} onChange={e => f('other_languages', e.target.value)} className="mt-1" placeholder="예: 인도네시아어 (중급), 일본어 (초급)" />
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
                <div><Label className="text-xs">약물/알코올 검사일</Label><Input type="date" value={formData.drug_test_date} onChange={e => f('drug_test_date', e.target.value)} className="mt-1" /></div>
                <div>
                  <Label className="text-xs">약물/알코올 검사 결과</Label>
                  <Select value={formData.drug_test_result} onValueChange={v => f('drug_test_result', v)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">선택 안함</SelectItem>
                      <SelectItem value="pass">합격 (Pass)</SelectItem>
                      <SelectItem value="fail">불합격 (Fail)</SelectItem>
                      <SelectItem value="pending">대기 중</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs">신체검사일</Label><Input type="date" value={formData.physical_exam_date} onChange={e => f('physical_exam_date', e.target.value)} className="mt-1" /></div>
                <div>
                  <Label className="text-xs">신체검사 결과</Label>
                  <Select value={formData.physical_exam_result} onValueChange={v => f('physical_exam_result', v)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
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
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">선택 안함</SelectItem>
                      <SelectItem value="yes">접종 완료</SelectItem>
                      <SelectItem value="no">미접종</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs">황열병 접종일</Label><Input type="date" value={formData.yellow_fever_date} onChange={e => f('yellow_fever_date', e.target.value)} className="mt-1" disabled={formData.yellow_fever_vaccination !== 'yes'} /></div>
                <div className="col-span-2">
                  <Label className="text-xs">기왕증 (과거 병력)</Label>
                  <Textarea value={formData.previous_illness} onChange={e => f('previous_illness', e.target.value)} className="mt-1 text-sm" rows={2} placeholder="과거 질병, 수술, 특이 병력 등" />
                </div>
              </div>
            </div>
          </TabsContent>

          {/* 연락처 */}
          <TabsContent value="emergency" className="space-y-3 mt-4 data-[state=inactive]:hidden">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">비상 연락처 및 가족 연락처</span>
              <Button type="button" variant="outline" size="sm" onClick={addContact} className="h-7 text-xs gap-1">
                <Plus className="h-3 w-3" />추가
              </Button>
            </div>
            {emergencyContacts.length === 0 ? (
              <div className="text-center py-6 text-sm text-gray-400 border-2 border-dashed rounded-md">연락처를 추가하세요.</div>
            ) : (
              <div className="space-y-3">
                {emergencyContacts.map((contact, idx) => (
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
            )}
          </TabsContent>

          {/* 증서 */}
          <TabsContent value="certificates" className="space-y-3 mt-4 data-[state=inactive]:hidden">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">보유 증서 ({certificates.length}건)</span>
              <div className="flex gap-2">
                <Select onValueChange={v => addCert(v)}>
                  <SelectTrigger className="h-8 text-xs w-52"><SelectValue placeholder="증서 선택 추가" /></SelectTrigger>
                  <SelectContent>{CERT_TEMPLATES.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}</SelectContent>
                </Select>
                <Button type="button" variant="outline" size="sm" onClick={() => addCert()} className="h-8 text-xs gap-1"><Plus className="h-3 w-3" />직접 입력</Button>
              </div>
            </div>
            {certificates.length === 0 ? (
              <div className="text-center py-6 text-sm text-gray-400 border-2 border-dashed rounded-md">증서를 추가하세요.</div>
            ) : (
              <div className="space-y-3">
                {certificates.map((cert, idx) => (
                  <div key={idx} className="p-3 border rounded-md bg-gray-50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-gray-600">증서 {idx + 1}</span>
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeCert(idx)} className="h-6 w-6 p-0 text-red-500"><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                    <div className="space-y-1.5">
                      <div className="grid grid-cols-2 gap-2">
                        <div><Label className="text-xs text-gray-500">증서명 *</Label><Input value={cert.name} onChange={e => updateCert(idx, 'name', e.target.value)} className="h-7 text-xs mt-0.5" /></div>
                        <div><Label className="text-xs text-gray-500">증서 번호</Label><Input value={cert.number || ''} onChange={e => updateCert(idx, 'number', e.target.value)} className="h-7 text-xs mt-0.5" /></div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div><Label className="text-xs text-gray-500">발급일</Label><Input type="date" value={cert.issued_date || ''} onChange={e => handleIssuedDate(idx, e.target.value)} className="h-7 text-xs mt-0.5" /></div>
                        <div>
                          <div className="flex items-center justify-between mt-0.5 mb-0.5">
                            <Label className="text-xs text-gray-500">만료일</Label>
                            <label className="flex items-center gap-1 text-xs text-gray-400 cursor-pointer">
                              <input type="checkbox" checked={cert.no_expiry || false} onChange={e => handleNoExpiry(idx, e.target.checked)} className="accent-blue-600 w-3 h-3" />만료일 없음
                            </label>
                          </div>
                          <Input type="date" value={cert.expiry_date || ''} onChange={e => updateCert(idx, 'expiry_date', e.target.value)} className="h-7 text-xs" disabled={cert.no_expiry} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div><Label className="text-xs text-gray-500">발급 기관</Label><Input value={cert.issuing_authority || ''} onChange={e => updateCert(idx, 'issuing_authority', e.target.value)} className="h-7 text-xs mt-0.5" /></div>
                        <div>
                          <Label className="text-xs text-gray-500">증서 사본</Label>
                          <div className="mt-0.5">
                            {cert.file_name ? (
                              <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 border border-blue-200 rounded text-xs h-7">
                                <span className="flex-1 truncate text-blue-700">{cert.file_name}</span>
                                <button type="button" onClick={() => { updateCert(idx, 'file_path', ''); updateCert(idx, 'file_name', ''); setCertFiles(prev => { const n = { ...prev }; delete n[idx]; return n; }); }} className="text-red-400"><X className="h-3 w-3" /></button>
                              </div>
                            ) : certFiles[idx] ? (
                              <div className="flex items-center gap-1.5 px-2 py-1 bg-green-50 border border-green-200 rounded text-xs h-7">
                                <span className="flex-1 truncate text-green-700">{certFiles[idx].name}</span>
                                <button type="button" onClick={() => setCertFiles(prev => { const n = { ...prev }; delete n[idx]; return n; })} className="text-red-400"><X className="h-3 w-3" /></button>
                              </div>
                            ) : (
                              <label className="flex items-center gap-1.5 px-2 py-1 border border-dashed rounded cursor-pointer hover:bg-gray-50 text-xs text-gray-400 h-7">
                                <Upload className="h-3 w-3 shrink-0" /><span className="truncate">파일 선택</span>
                                <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={e => { const file = e.target.files?.[0]; if (file) { if (file.size > 10 * 1024 * 1024) { alert('10MB 초과'); return; } setCertFiles(prev => ({ ...prev, [idx]: file })); } }} />
                              </label>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <div className="flex justify-between pt-4 border-t">
          <Button variant="outline" onClick={() => onClose(false)} disabled={saving}>취소</Button>
          <Button onClick={handleSave} disabled={saving} className="min-w-24">
            {saving ? '저장 중...' : crew ? '저장' : '등록'}
          </Button>
        </div>
    </div>
  );
}

export default CrewFormDialog;
