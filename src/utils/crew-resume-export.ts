import * as XLSX from 'xlsx-js-style';
import { supabase } from '@/lib/supabase';
import { getCompanyInfo } from '@/services/company-info.service';

interface Certificate {
  name: string;
  number?: string;
  issued_date?: string;
  expiry_date?: string;
  issuing_authority?: string;
  no_expiry?: boolean;
}

interface SeaServiceRow {
  ship_name: string;
  ship_type?: string;
  flag?: string;
  gross_tonnage?: number;
  rank: string;
  rank_grade?: string | null;
  sign_on_date: string;
  sign_off_date?: string;
  sign_off_reason_name?: string;
}

const LEVEL_LABELS: Record<string, string> = {
  beginner: '초급', intermediate: '중급', advanced: '고급', excellent: '유창',
};
const MARITAL_LABELS: Record<string, string> = {
  single: '미혼', married: '기혼', divorced: '이혼', widowed: '사별',
};

const fmt = (date?: string | null) => (date ? date.slice(0, 10) : '-');
const yesNo = (v?: boolean | null) => (v === true ? '예' : v === false ? '아니오' : '-');

const THIN = { style: 'thin', color: { rgb: 'CCCCCC' } } as const;
const BOX = { top: THIN, bottom: THIN, left: THIN, right: THIN };
const labelCell = (v: string) => ({ v, t: 's' as const, s: { font: { bold: true, sz: 9 }, fill: { fgColor: { rgb: 'F0F4FF' } }, border: BOX, alignment: { vertical: 'center' } } });
const valueCell = (v: string | number) => ({ v, t: (typeof v === 'number' ? 'n' : 's') as 's' | 'n', s: { font: { sz: 9 }, border: BOX, alignment: { vertical: 'center' } } });
const sectionCell = (v: string) => ({ v, t: 's' as const, s: { font: { bold: true, sz: 10, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '1D4ED8' } }, alignment: { vertical: 'center' } } });
const tableHeaderCell = (v: string) => ({ v, t: 's' as const, s: { font: { bold: true, sz: 9 }, fill: { fgColor: { rgb: 'E8EEF8' } }, border: BOX, alignment: { horizontal: 'center', vertical: 'center' } } });
const tableCell = (v: string | number) => ({ v, t: (typeof v === 'number' ? 'n' : 's') as 's' | 'n', s: { font: { sz: 9 }, border: BOX, alignment: { vertical: 'center' } } });

interface SaveFilePickerWindow extends Window {
  showSaveFilePicker?: (options: {
    suggestedName?: string;
    types?: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<{
    createWritable: () => Promise<{ write: (data: BlobPart) => Promise<void>; close: () => Promise<void> }>;
  }>;
}

export async function exportCrewResumeToExcel(crewId: string): Promise<void> {
  const [{ data: crew, error: crewErr }, { data: serviceData }, company] = await Promise.all([
    supabase.from('crew_members').select('*').eq('id', crewId).single(),
    supabase.from('sea_service_records').select('*, sign_off_reasons(name)').eq('crew_member_id', crewId).order('sign_on_date', { ascending: false }),
    getCompanyInfo().catch(() => null),
  ]);
  if (crewErr || !crew) throw new Error('선원 정보를 불러올 수 없습니다.');

  let certs: Certificate[] = [];
  try {
    certs = typeof crew.certificates === 'string' ? JSON.parse(crew.certificates) : (crew.certificates || []);
  } catch { certs = []; }

  const seaService: SeaServiceRow[] = (serviceData || []).map((r: SeaServiceRow & { sign_off_reasons?: { name: string } | null }) => ({
    ...r,
    sign_off_reason_name: r.sign_off_reasons?.name,
  }));

  let rankName = '';
  if (crew.rank_id) {
    const { data: r } = await supabase.from('ranks').select('name, rank_code').eq('id', crew.rank_id).single();
    if (r) rankName = `${r.rank_code} / ${r.name}`;
  }

  const rows: unknown[][] = [];
  const merges: XLSX.Range[] = [];
  const pushSection = (title: string) => {
    rows.push([sectionCell(title), '', '', ''].map((c, i) => (i === 0 ? c : { v: '', t: 's', s: sectionCell('').s })));
    merges.push({ s: { r: rows.length - 1, c: 0 }, e: { r: rows.length - 1, c: 3 } });
  };
  const pushInfoRow = (l1: string, v1: string, l2?: string, v2?: string) => {
    rows.push([labelCell(l1), valueCell(v1), labelCell(l2 || ''), valueCell(v2 ?? '')]);
  };

  rows.push([{ v: company?.name || '', t: 's', s: { font: { bold: true, sz: 14 } } }]);
  rows.push([{ v: 'CREW RESUME', t: 's', s: { font: { bold: true, sz: 12, color: { rgb: '1D4ED8' } } } }]);
  rows.push([]);

  pushSection('Personal Information');
  pushInfoRow('이름', crew.name || '-', '영문이름', crew.name_english || '-');
  pushInfoRow('한자이름', crew.name_chinese || '-', '직급', rankName || crew.rank || '-');
  pushInfoRow('국적', crew.nationality || '-', '생년월일', fmt(crew.date_of_birth));
  pushInfoRow('출생지', crew.place_of_birth || '-', '혈액형', crew.blood_type || '-');
  pushInfoRow('결혼여부', crew.marital_status ? MARITAL_LABELS[crew.marital_status] || crew.marital_status : '-', '자녀수', crew.children_count != null ? String(crew.children_count) : '-');
  pushInfoRow('종교', crew.religion || '-', '연락처', crew.phone || '-');
  pushInfoRow('이메일', crew.email || '-', 'SID', crew.sid || '-');
  rows.push([]);

  pushSection('Physical Data');
  pushInfoRow('키', crew.height ? `${crew.height} cm` : '-', '몸무게', crew.weight ? `${crew.weight} kg` : '-');
  pushInfoRow('눈 색', crew.eye_color || '-', '신발 사이즈', crew.shoe_size ? `${crew.shoe_size} mm` : '-');
  pushInfoRow('작업복 사이즈', crew.coverall_size || '-', '의류 사이즈', crew.clothing_size || '-');
  pushInfoRow('흡연', crew.smoking === true ? '흡연' : crew.smoking === false ? '비흡연' : '-', '음주', crew.drinking === true ? '음주' : crew.drinking === false ? '비음주' : '-');
  rows.push([]);

  pushSection('Documents');
  pushInfoRow('여권 번호', crew.passport_number || '-', '여권 만료일', fmt(crew.passport_expiry));
  pushInfoRow('선원수첩(국내)', crew.seaman_book_number || '-', '국내 만료일', fmt(crew.seaman_book_expiry));
  pushInfoRow('선원수첩(국제)', crew.seaman_book_flag_number || '-', '국제 만료일', fmt(crew.seaman_book_flag_expiry));
  rows.push([]);

  pushSection('Language Skills');
  pushInfoRow('영어 읽기/쓰기', crew.english_read_write ? LEVEL_LABELS[crew.english_read_write] || crew.english_read_write : '-', '영어 말하기/듣기', crew.english_speak_listen ? LEVEL_LABELS[crew.english_speak_listen] || crew.english_speak_listen : '-');
  pushInfoRow('기타 언어', crew.other_languages || '-');
  rows.push([]);

  pushSection('Health & Medical');
  pushInfoRow('신체검사일', fmt(crew.physical_exam_date), '신체검사 결과', crew.physical_exam_result === 'fit' ? 'FIT' : crew.physical_exam_result === 'unfit' ? 'UNFIT' : '-');
  pushInfoRow('약물/알코올 검사일', fmt(crew.drug_test_date), '검사 결과', crew.drug_test_result === 'pass' ? 'PASS' : crew.drug_test_result === 'fail' ? 'FAIL' : '-');
  pushInfoRow('황열병 예방접종', yesNo(crew.yellow_fever_vaccination), '접종일', fmt(crew.yellow_fever_date));
  rows.push([]);

  if (certs.length > 0) {
    pushSection('Certificates & Documents');
    rows.push(['증서명', '번호', '발급일', '만료일', '발급기관'].map(tableHeaderCell));
    certs.forEach(c => {
      rows.push([
        tableCell(c.name), tableCell(c.number || '-'), tableCell(fmt(c.issued_date)),
        tableCell(c.no_expiry ? '제한없음' : fmt(c.expiry_date)), tableCell(c.issuing_authority || '-'),
      ]);
    });
    rows.push([]);
  }

  if (seaService.length > 0) {
    pushSection('Sea Service Record');
    rows.push(['선박명', '선종', '국적', 'GRT', '직책', '승선일', '하선일', '하선사유'].map(tableHeaderCell));
    seaService.forEach(rec => {
      rows.push([
        tableCell(rec.ship_name), tableCell(rec.ship_type || '-'), tableCell(rec.flag || '-'),
        tableCell(rec.gross_tonnage ?? '-'), tableCell(`${rec.rank}${rec.rank_grade ? `(${rec.rank_grade})` : ''}`),
        tableCell(fmt(rec.sign_on_date)), tableCell(rec.sign_off_date ? fmt(rec.sign_off_date) : '현재'),
        tableCell(rec.sign_off_reason_name || '-'),
      ]);
    });
  }

  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet['!cols'] = [{ wch: 16 }, { wch: 22 }, { wch: 16 }, { wch: 22 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 20 }];
  worksheet['!merges'] = merges;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Resume');
  const fileName = `${crew.name || 'crew'}_이력서.xlsx`;

  const picker = (window as SaveFilePickerWindow).showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker({
        suggestedName: fileName,
        types: [{
          description: 'Excel Workbook',
          accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] },
        }],
      });
      const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const writable = await handle.createWritable();
      await writable.write(buffer);
      await writable.close();
      return;
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return;
    }
  }
  XLSX.writeFile(workbook, fileName);
}
