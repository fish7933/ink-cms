import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import en from '@/i18n/locales/components/CrewResumeSheet/en.json';
i18n.addResourceBundle('en', 'CrewResumeSheet', en, true, true);
import { supabase } from '@/lib/supabase';
import { getCompanyInfo, type CompanyInfo } from '@/services/company-info.service';

interface Certificate {
  name: string;
  number?: string;
  issued_date?: string;
  expiry_date?: string;
  issuing_authority?: string;
  no_expiry?: boolean;
}

interface SeaServiceRecord {
  id: string;
  ship_name: string;
  ship_type?: string;
  flag?: string;
  gross_tonnage?: number;
  engine_power?: number;
  rank: string;
  rank_grade?: string | null;
  sign_on_date: string;
  sign_off_date?: string;
  sign_off_reason?: string;
  sign_off_reason_name?: string;
  port_of_sign_on?: string;
  port_of_sign_off?: string;
  notes?: string;
}

interface EmergencyContact {
  name: string;
  relationship: string;
  phone: string;
  note?: string;
}

interface CrewData {
  id: string;
  name?: string;
  name_english?: string;
  name_chinese?: string;
  rank?: string;
  rank_id?: string;
  nationality?: string;
  date_of_birth?: string;
  photo_url?: string;
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
  english_read_write?: string;
  english_speak_listen?: string;
  other_languages?: string;
  job_ability?: string;
  motivation?: string;
  previous_illness?: string;
  drug_test_date?: string;
  drug_test_result?: string;
  physical_exam_date?: string;
  physical_exam_result?: string;
  yellow_fever_vaccination?: boolean;
  yellow_fever_date?: string;
  passport_number?: string;
  passport_expiry?: string;
  seaman_book_number?: string;
  seaman_book_expiry?: string;
  seaman_book_flag_number?: string;
  seaman_book_flag_expiry?: string;
  sid?: string;
  phone?: string;
  email?: string;
  certificates?: Certificate[];
  emergency_contacts?: EmergencyContact[];
}

const fmt = (date?: string) => {
  if (!date) return '-';
  return date.slice(0, 10);
};

function calculateAge(dateOfBirth: string): number {
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
  return age;
}

const yesNo = (val: boolean | null | undefined, t: (key: string) => string) => {
  if (val === true) return t('예 (Yes)');
  if (val === false) return t('아니오 (No)');
  return '-';
};

const LEVEL_LABELS: Record<string, string> = {
  beginner: '초급', intermediate: '중급', advanced: '고급', excellent: '유창',
};
const MARITAL_LABELS: Record<string, string> = {
  single: '미혼', married: '기혼', divorced: '이혼', widowed: '사별',
};

// 라벨 위 · 값 아래로 쌓는 가벼운 필드 — 상자 테두리 없이 공백과 정렬만으로 구분한다.
function Field({ label, value, className = '', valueClassName = '' }: { label: string; value: React.ReactNode; className?: string; valueClassName?: string }) {
  return (
    <div className={`resume-field ${className}`}>
      <span className="resume-field-label">{label}</span>
      <span className={`resume-field-value ${valueClassName}`}>{value}</span>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="resume-section-title">{children}</div>;
}

interface Props {
  crewId: string;
}

// 선원 이력서 문서 본문 — 독립 인쇄 페이지와 인쇄 모달 양쪽에서 재사용된다.
// 상단 레터헤드는 결재문서 시행문(ApprovalDocumentIssuedSheet)과 동일하게 회사정보(company_info)를 사용한다.
export default function CrewResumeSheet({ crewId }: Props) {
  const { t, i18n } = useTranslation('CrewResumeSheet');
  const [crew, setCrew] = useState<CrewData | null>(null);
  const [rankName, setRankName] = useState('');
  const [nationalityName, setNationalityName] = useState<{ country_name_ko: string; country_name_en: string } | null>(null);
  const [rankCodeByName, setRankCodeByName] = useState<Map<string, string>>(new Map());
  const [rankCodes, setRankCodes] = useState<Set<string>>(new Set());
  const [seaService, setSeaService] = useState<SeaServiceRecord[]>([]);
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!crewId) { setError(t('선원 ID 없음')); setLoading(false); return; }

    Promise.all([
      supabase.from('crew_members').select('*').eq('id', crewId).single(),
      supabase.from('sea_service_records').select('*, sign_off_reasons(name)').eq('crew_member_id', crewId).order('sign_on_date', { ascending: false }),
      getCompanyInfo().catch(() => null),
      supabase.from('ranks').select('name, rank_code'),
    ]).then(([{ data: crewData, error: crewErr }, { data: serviceData }, companyInfo, { data: allRanks }]) => {
      setRankCodeByName(new Map((allRanks || []).map(r => [r.name, r.rank_code])));
      setRankCodes(new Set((allRanks || []).map(r => r.rank_code)));
      if (crewErr || !crewData) { setError(t('선원 정보를 불러올 수 없습니다.')); setLoading(false); return; }

      let certs: Certificate[] = [];
      try {
        certs = typeof crewData.certificates === 'string'
          ? JSON.parse(crewData.certificates) : (crewData.certificates || []);
      } catch { certs = []; }

      let contacts: EmergencyContact[] = [];
      try {
        contacts = typeof crewData.emergency_contacts === 'string'
          ? JSON.parse(crewData.emergency_contacts) : (crewData.emergency_contacts || []);
      } catch { contacts = []; }

      setCrew({ ...crewData, certificates: certs, emergency_contacts: contacts });
      setSeaService((serviceData || []).map((r: SeaServiceRecord & { sign_off_reasons?: { name: string } | null }) => ({
        ...r,
        sign_off_reason_name: r.sign_off_reasons?.name,
      })));
      setCompany(companyInfo);

      if (crewData.rank_id) {
        supabase.from('ranks').select('name').eq('id', crewData.rank_id).single()
          .then(({ data: r }) => { if (r) setRankName(r.name); });
      }
      if (crewData.nationality) {
        supabase.from('nationalities').select('country_name_ko, country_name_en').eq('country_code', crewData.nationality).maybeSingle()
          .then(({ data: n }) => { if (n) setNationalityName(n); });
      }
      setLoading(false);
    }).catch((e) => {
      console.error(e);
      setError(t('선원 정보를 불러올 수 없습니다.'));
      setLoading(false);
    });
  }, [crewId]);

  if (loading) return <div style={{ padding: 40, fontFamily: 'sans-serif' }}>{t('불러오는 중...')}</div>;
  if (error || !crew) return <div style={{ padding: 40, fontFamily: 'sans-serif', color: 'red' }}>{error || t('오류')}</div>;

  // 레터헤드 회사명 — 영문 전환 시 결재문서 시행문과 동일하게 name_en(없으면 국문 그대로)을 쓴다.
  const companyName = i18n.language === 'en' ? (company?.name_en || company?.name) : company?.name;
  // 승선 이력의 직책은 기록 당시 값이 직급코드("C/E")로도, 풀네임("Chief Engineer")으로도
  // 저장돼 있어 표기를 코드로 통일한다 — 이미 코드면 그대로, 풀네임이면 매칭되는 코드로 치환.
  const resolveRankCode = (rank: string) => rankCodes.has(rank) ? rank : (rankCodeByName.get(rank) || rank);
  const isEnglish = i18n.language === 'en';
  // 영문 모드에서는 이름 자체를 영문명으로 보여주므로 별도 "영문이름"/"한자이름" 란이 더 필요없다.
  const displayName = isEnglish ? (crew.name_english || crew.name) : crew.name;
  // 이제 선원 이름은 기본적으로 영문으로 입력되어 영문이름이 메인 이름과 같은 경우가 대부분이다
  // — 메인 이름에 이미 나온 값과 같으면 "영문이름" 칸을 또 보여줄 필요가 없다.
  const showEnglishNameField = !!crew.name_english?.trim() && crew.name_english.trim() !== (displayName || '').trim();
  const nationalityDisplay = nationalityName ? (isEnglish ? nationalityName.country_name_en : nationalityName.country_name_ko) : (crew.nationality || '');
  const age = crew.date_of_birth ? calculateAge(crew.date_of_birth) : null;
  const nameSuffix = [age != null ? t('{{age}}세', { age }) : null, nationalityDisplay || null].filter(Boolean).join(', ');

  return (
    <div className="resume" style={{ maxWidth: 820, margin: '0 auto', fontFamily: "'Pretendard', 'Malgun Gothic', 'Apple SD Gothic Neo', Arial, sans-serif", fontSize: '9pt', color: '#1e293b' }}>
      <style>{`
        .resume { line-height: 1.5; }
        .resume-section { margin-bottom: 18px; }
        .resume-section-title {
          font-size: 8pt; font-weight: 700; color: #0f172a;
          text-transform: uppercase; letter-spacing: 1.5px;
          padding-bottom: 5px; margin-bottom: 10px;
          border-bottom: 1.5px solid #0f172a;
        }
        .resume-field-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px 20px; }
        .resume-field { display: flex; flex-direction: column; gap: 1px; padding-bottom: 6px; border-bottom: 1px solid #eef0f3; }
        .resume-field-span { grid-column: 1 / -1; }
        .resume-field-label { font-size: 7pt; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.4px; }
        .resume-field-value { font-size: 8.5pt; color: #1e293b; }
        .resume-profile-block { display: flex; gap: 18px; margin-bottom: 14px; align-items: flex-start; }
        .resume-profile-photo { width: 92px; height: 116px; border-radius: 4px; border: 1px solid #e2e8f0; object-fit: cover; flex-shrink: 0; }
        .resume-profile-photo-placeholder {
          width: 92px; height: 116px; border-radius: 4px; border: 1px dashed #cbd5e1; background: #f8fafc;
          display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: #94a3b8; font-size: 7pt; letter-spacing: 0.5px;
        }
        .resume-profile-info { flex: 1; padding-top: 2px; }
        .resume-crew-name { font-size: 15pt; font-weight: 800; color: #0f172a; letter-spacing: 0.2px; }
        .resume-crew-name-suffix { font-size: 11pt; font-weight: 500; color: #64748b; }
        .resume-crew-rank {
          display: inline-block; margin-top: 6px; margin-bottom: 10px;
          font-size: 10.5pt; font-weight: 700; color: #0f172a; background: #eef2f7;
          padding: 4px 12px; border-radius: 999px; letter-spacing: 0.3px;
        }
        .resume table { width: 100%; border-collapse: collapse; font-size: 8pt; }
        .resume th {
          font-weight: 700; font-size: 7pt; letter-spacing: 0.3px; text-transform: uppercase; color: #64748b;
          padding: 5px 7px; border-bottom: 1.5px solid #0f172a; text-align: center; white-space: nowrap;
        }
        .resume td { padding: 5px 7px; border-bottom: 1px solid #eef0f3; vertical-align: top; color: #1e293b; }
        .resume tbody tr:last-child td { border-bottom: 1px solid #cbd5e1; }
        .resume-cert-expired { color: #dc2626; font-weight: 600; }
        .resume-cert-ok { color: #15803d; }
        .resume-footer {
          margin-top: 16px; padding-top: 8px; border-top: 1px solid #e2e8f0;
          font-size: 7.5pt; color: #94a3b8; display: flex; justify-content: space-between;
        }
        .resume-result-pass { color: #15803d; font-weight: 700; }
        .resume-result-fail { color: #dc2626; font-weight: 700; }
      `}</style>

      {/* 레터헤드 — 결재문서 시행문(ApprovalDocumentIssuedSheet)과 동일한 회사정보 헤더 */}
      {company && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          {company.logo_url && <img src={company.logo_url} alt="" style={{ height: 36 }} />}
          <div>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: '#0f172a' }}>{companyName}</div>
            <div style={{ fontSize: 9.5, color: '#94a3b8', marginTop: 1 }}>
              {[company.address, company.phone && `Tel. ${company.phone}`, company.fax && `Fax. ${company.fax}`].filter(Boolean).join('  ·  ')}
            </div>
            {(company.email || company.website) && (
              <div style={{ fontSize: 9.5, color: '#94a3b8' }}>
                {[company.email, company.website].filter(Boolean).join('  ·  ')}
              </div>
            )}
          </div>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', borderBottom: '2.5px solid #0f172a', paddingBottom: 8, marginBottom: 18 }}>
        <div style={{ fontSize: '15pt', fontWeight: 800, letterSpacing: 3, color: '#0f172a' }}>CREW RESUME</div>
        <div style={{ fontSize: 8, color: '#94a3b8', letterSpacing: 0.3 }}>{t('출력일: {{date}}', { date: new Date().toLocaleDateString('ko-KR') })}</div>
      </div>

      {/* 프로필 + 기본정보 */}
      <div className="resume-section">
        <SectionTitle>Personal Information</SectionTitle>
        <div className="resume-profile-block">
          {crew.photo_url
            ? <img src={crew.photo_url} className="resume-profile-photo" alt="crew" />
            : <div className="resume-profile-photo-placeholder">NO PHOTO</div>
          }
          <div className="resume-profile-info">
            <div className="resume-crew-name">
              {displayName || '-'}
              {nameSuffix && <span className="resume-crew-name-suffix"> ({nameSuffix})</span>}
            </div>
            <div className="resume-crew-rank">{rankName || crew.rank || '-'}</div>
            <div className="resume-field-grid">
              {showEnglishNameField && <Field label={t('영문이름')} value={crew.name_english} />}
              {!isEnglish && <Field label={t('한자이름')} value={crew.name_chinese || '-'} />}
              <Field label={t('국적')} value={nationalityDisplay || '-'} />
              <Field label={t('생년월일')} value={fmt(crew.date_of_birth)} />
              <Field label={t('출생지')} value={crew.place_of_birth || '-'} />
              <Field label={t('혈액형')} value={crew.blood_type || '-'} />
              <Field label={t('결혼여부')} value={crew.marital_status ? t(MARITAL_LABELS[crew.marital_status] || crew.marital_status) : '-'} />
              <Field label={t('자녀수')} value={crew.children_count ?? '-'} />
              <Field label={t('종교')} value={crew.religion || '-'} />
              <Field label={t('연락처')} value={crew.phone || '-'} />
              <Field label={t('이메일')} value={crew.email || '-'} />
              <Field label="SID" value={crew.sid || '-'} />
            </div>
          </div>
        </div>
      </div>

      {/* 신체 정보 */}
      <div className="resume-section">
        <SectionTitle>Physical Data</SectionTitle>
        <div className="resume-field-grid">
          <Field label={t('키 (Height)')} value={crew.height ? `${crew.height} cm` : '-'} />
          <Field label={t('몸무게 (Weight)')} value={crew.weight ? `${crew.weight} kg` : '-'} />
          <Field label={t('혈액형')} value={crew.blood_type || '-'} />
          <Field label={t('눈 색')} value={crew.eye_color || '-'} />
          <Field label={t('신발 사이즈')} value={crew.shoe_size ? `${crew.shoe_size} mm` : '-'} />
          <Field label={t('작업복 사이즈')} value={crew.coverall_size || '-'} />
          <Field label={t('의류 사이즈')} value={crew.clothing_size || '-'} />
          <Field label={t('흡연')} value={crew.smoking === true ? t('흡연') : crew.smoking === false ? t('비흡연') : '-'} />
          <Field label={t('음주')} value={crew.drinking === true ? t('음주') : crew.drinking === false ? t('비음주') : '-'} />
        </div>
      </div>

      {/* 서류 번호 */}
      <div className="resume-section">
        <SectionTitle>Documents</SectionTitle>
        <div className="resume-field-grid">
          <Field label={t('여권 번호')} value={crew.passport_number || '-'} />
          <Field label={t('여권 만료일')} value={fmt(crew.passport_expiry)} />
          <div />
          <Field label={t('선원수첩 (국내)')} value={crew.seaman_book_number || '-'} />
          <Field label={t('국내 만료일')} value={fmt(crew.seaman_book_expiry)} />
          <div />
          <Field label={t('선원수첩 (국제)')} value={crew.seaman_book_flag_number || '-'} />
          <Field label={t('국제 만료일')} value={fmt(crew.seaman_book_flag_expiry)} />
          <div />
        </div>
      </div>

      {/* 언어 능력 */}
      <div className="resume-section">
        <SectionTitle>Language Skills</SectionTitle>
        <div className="resume-field-grid">
          <Field label={t('영어 읽기/쓰기')} value={crew.english_read_write ? t(LEVEL_LABELS[crew.english_read_write] || crew.english_read_write) : '-'} />
          <Field label={t('영어 말하기/듣기')} value={crew.english_speak_listen ? t(LEVEL_LABELS[crew.english_speak_listen] || crew.english_speak_listen) : '-'} />
          <Field label={t('기타 언어')} value={crew.other_languages || '-'} />
          {crew.job_ability && <Field label={t('업무 능력')} value={crew.job_ability} className="resume-field-span" />}
          {crew.motivation && <Field label={t('지원 동기')} value={crew.motivation} className="resume-field-span" />}
        </div>
      </div>

      {/* 건강/신체검사 */}
      <div className="resume-section">
        <SectionTitle>Health & Medical</SectionTitle>
        <div className="resume-field-grid">
          <Field label={t('신체검사일')} value={fmt(crew.physical_exam_date)} />
          <Field
            label={t('신체검사 결과')}
            value={crew.physical_exam_result === 'fit' ? 'FIT' : crew.physical_exam_result === 'unfit' ? 'UNFIT' : '-'}
            valueClassName={crew.physical_exam_result === 'fit' ? 'resume-result-pass' : crew.physical_exam_result === 'unfit' ? 'resume-result-fail' : ''}
          />
          <div />
          <Field label={t('약물/알코올 검사일')} value={fmt(crew.drug_test_date)} />
          <Field
            label={t('검사 결과')}
            value={crew.drug_test_result === 'pass' ? 'PASS' : crew.drug_test_result === 'fail' ? 'FAIL' : '-'}
            valueClassName={crew.drug_test_result === 'pass' ? 'resume-result-pass' : crew.drug_test_result === 'fail' ? 'resume-result-fail' : ''}
          />
          <div />
          <Field label={t('황열병 예방접종')} value={yesNo(crew.yellow_fever_vaccination, t)} />
          <Field label={t('접종일')} value={fmt(crew.yellow_fever_date)} />
          <div />
          {crew.previous_illness && <Field label={t('기왕증')} value={crew.previous_illness} className="resume-field-span" />}
        </div>
      </div>

      {/* 보유 증서 */}
      {crew.certificates && crew.certificates.length > 0 && (
        <div className="resume-section">
          <SectionTitle>Certificates & Documents</SectionTitle>
          <table>
            <thead>
              <tr>
                <th style={{ width: '35%', textAlign: 'left' }}>{t('증서명')}</th>
                <th style={{ width: '18%' }}>{t('번호')}</th>
                <th style={{ width: '12%' }}>{t('발급일')}</th>
                <th style={{ width: '12%' }}>{t('만료일')}</th>
                <th style={{ width: '23%', textAlign: 'left' }}>{t('발급기관')}</th>
              </tr>
            </thead>
            <tbody>
              {crew.certificates.map((cert, i) => {
                const isExpired = cert.expiry_date && !cert.no_expiry && new Date(cert.expiry_date) < new Date();
                return (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{cert.name}</td>
                    <td style={{ textAlign: 'center' }}>{cert.number || '-'}</td>
                    <td style={{ textAlign: 'center' }}>{fmt(cert.issued_date)}</td>
                    <td style={{ textAlign: 'center' }} className={isExpired ? 'resume-cert-expired' : cert.no_expiry ? '' : 'resume-cert-ok'}>
                      {cert.no_expiry ? t('제한없음') : fmt(cert.expiry_date)}
                    </td>
                    <td>{cert.issuing_authority || '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 승선 이력 */}
      {seaService.length > 0 && (
        <div className="resume-section">
          <SectionTitle>Sea Service Record</SectionTitle>
          <table>
            <thead>
              <tr>
                <th style={{ width: '22%', textAlign: 'left' }}>{t('선박명')}</th>
                <th style={{ width: '8%' }}>{t('선종')}</th>
                <th style={{ width: '6%' }}>{t('국적')}</th>
                <th style={{ width: '7%' }}>GRT</th>
                <th style={{ width: '8%' }}>{t('직책')}</th>
                <th style={{ width: '9%' }}>{t('승선일')}</th>
                <th style={{ width: '9%' }}>{t('하선일')}</th>
                <th style={{ width: '8%' }}>{t('기간')}</th>
                <th style={{ width: '23%', textAlign: 'left' }}>{t('하선 사유')}</th>
              </tr>
            </thead>
            <tbody>
              {seaService.map((rec, i) => {
                const months = rec.sign_on_date && rec.sign_off_date
                  ? Math.round((new Date(rec.sign_off_date).getTime() - new Date(rec.sign_on_date).getTime()) / (1000 * 60 * 60 * 24 * 30))
                  : null;
                return (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{rec.ship_name}</td>
                    <td style={{ textAlign: 'center' }}>{rec.ship_type || '-'}</td>
                    <td style={{ textAlign: 'center' }}>{rec.flag || '-'}</td>
                    <td style={{ textAlign: 'center' }}>{rec.gross_tonnage?.toLocaleString() || '-'}</td>
                    <td style={{ textAlign: 'center' }}>{resolveRankCode(rec.rank)}{rec.rank_grade ? `(${rec.rank_grade})` : ''}</td>
                    <td style={{ textAlign: 'center' }}>{fmt(rec.sign_on_date)}</td>
                    <td style={{ textAlign: 'center' }}>{rec.sign_off_date ? fmt(rec.sign_off_date) : t('현재')}</td>
                    <td style={{ textAlign: 'center' }}>{months != null ? t('{{months}}개월', { months }) : '-'}</td>
                    <td>{rec.sign_off_reason_name || rec.sign_off_reason || '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 비상 연락처 */}
      {crew.emergency_contacts && crew.emergency_contacts.length > 0 && (
        <div className="resume-section">
          <SectionTitle>Emergency Contacts</SectionTitle>
          <div className="resume-field-grid">
            {crew.emergency_contacts.map((c, i) => (
              <Field key={i} label={`${c.relationship} (${i + 1})`} value={`${c.name} / ${c.phone}`} />
            ))}
          </div>
        </div>
      )}

      {/* 푸터 */}
      <div className="resume-footer">
        <span>{companyName || ''}{company?.address ? ` — ${company.address}` : ''}{company?.phone ? ` | Tel: ${company.phone}` : ''}</span>
      </div>
    </div>
  );
}
