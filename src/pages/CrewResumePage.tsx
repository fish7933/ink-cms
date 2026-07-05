import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

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
  phone?: string;
  email?: string;
  certificates?: Certificate[];
  emergency_contacts?: EmergencyContact[];
}

const fmt = (date?: string) => {
  if (!date) return '-';
  return date.slice(0, 10);
};

const yesNo = (val?: boolean | null) => {
  if (val === true) return '예 (Yes)';
  if (val === false) return '아니오 (No)';
  return '-';
};

const LEVEL_LABELS: Record<string, string> = {
  beginner: '초급', intermediate: '중급', advanced: '고급', excellent: '유창',
};
const MARITAL_LABELS: Record<string, string> = {
  single: '미혼', married: '기혼', divorced: '이혼', widowed: '사별',
};

export default function CrewResumePage() {
  const { id } = useParams<{ id: string }>();
  const [crew, setCrew] = useState<CrewData | null>(null);
  const [rankName, setRankName] = useState('');
  const [seaService, setSeaService] = useState<SeaServiceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) { setError('선원 ID 없음'); setLoading(false); return; }

    Promise.all([
      supabase.from('crew_members').select('*').eq('id', id).single(),
      supabase.from('sea_service_records').select('*, sign_off_reasons(name)').eq('crew_member_id', id).order('sign_on_date', { ascending: false }),
    ]).then(([{ data: crewData, error: crewErr }, { data: serviceData }]) => {
      if (crewErr || !crewData) { setError('선원 정보를 불러올 수 없습니다.'); setLoading(false); return; }

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

      if (crewData.rank_id) {
        supabase.from('ranks').select('name, rank_code').eq('id', crewData.rank_id).single()
          .then(({ data: r }) => { if (r) setRankName(`${r.rank_code} / ${r.name}`); });
      }
      setLoading(false);
    }).catch((e) => {
      console.error(e);
      setError('선원 정보를 불러올 수 없습니다.');
      setLoading(false);
    });
  }, [id]);

  if (loading) return <div style={{ padding: 40, fontFamily: 'sans-serif' }}>불러오는 중...</div>;
  if (error || !crew) return <div style={{ padding: 40, fontFamily: 'sans-serif', color: 'red' }}>{error || '오류'}</div>;

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', Arial, sans-serif; font-size: 9pt; color: #000; background: #fff; }

        .print-btn {
          position: fixed; top: 16px; right: 16px; z-index: 999;
          display: flex; gap: 8px;
          background: #1d4ed8; color: #fff;
          border: none; border-radius: 6px; padding: 8px 16px;
          font-size: 13px; cursor: pointer; font-weight: 600;
        }
        .print-btn:hover { background: #1e40af; }

        .resume { max-width: 210mm; margin: 0 auto; padding: 10mm; }

        .resume-header {
          display: flex; justify-content: space-between; align-items: flex-start;
          border-bottom: 2px solid #1d4ed8; padding-bottom: 8px; margin-bottom: 10px;
        }
        .company-name { font-size: 14pt; font-weight: 800; color: #1d4ed8; }
        .company-sub { font-size: 8pt; color: #555; }
        .resume-title { font-size: 16pt; font-weight: 800; letter-spacing: 2px; color: #1d4ed8; }

        .section { margin-bottom: 10px; }
        .section-title {
          font-size: 9pt; font-weight: 700; color: #fff;
          background: #1d4ed8; padding: 3px 8px; margin-bottom: 4px;
          text-transform: uppercase; letter-spacing: 1px;
        }

        .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 2px; }
        .info-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 2px; }
        .info-item { display: flex; border: 0.5px solid #ddd; }
        .info-label { background: #f0f4ff; font-weight: 600; padding: 3px 6px; min-width: 90px; font-size: 8pt; color: #333; white-space: nowrap; }
        .info-value { padding: 3px 6px; flex: 1; font-size: 8.5pt; }

        .profile-block { display: flex; gap: 10px; margin-bottom: 6px; }
        .profile-photo { width: 90px; height: 110px; border: 1px solid #ccc; object-fit: cover; flex-shrink: 0; }
        .profile-photo-placeholder { width: 90px; height: 110px; border: 1px solid #ccc; background: #f5f5f5; display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: #aaa; font-size: 8pt; }
        .profile-info { flex: 1; }
        .crew-name { font-size: 13pt; font-weight: 800; color: #1d4ed8; margin-bottom: 2px; }
        .crew-rank { font-size: 10pt; font-weight: 600; color: #374151; margin-bottom: 6px; }

        table { width: 100%; border-collapse: collapse; font-size: 8pt; }
        th { background: #e8eef8; font-weight: 600; padding: 4px 6px; border: 0.5px solid #ccc; text-align: center; }
        td { padding: 3px 6px; border: 0.5px solid #ccc; vertical-align: top; }
        tr:nth-child(even) td { background: #fafafa; }

        .cert-expired { color: #dc2626; }
        .cert-ok { color: #16a34a; }

        .footer {
          margin-top: 12px; padding-top: 6px; border-top: 1px solid #ccc;
          font-size: 7.5pt; color: #666; display: flex; justify-content: space-between;
        }

        .result-pass { color: #16a34a; font-weight: 600; }
        .result-fail { color: #dc2626; font-weight: 600; }

        @media print {
          .print-btn { display: none !important; }
          .resume { padding: 0; max-width: 100%; }
          @page { size: A4; margin: 10mm; }
          body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        }
      `}</style>

      <button className="print-btn" onClick={() => window.print()}>
        인쇄 / PDF 저장
      </button>

      <div className="resume">
        {/* 헤더 */}
        <div className="resume-header">
          <div>
            <div className="company-name">INK MARINE</div>
            <div className="company-sub">INK INTERNATIONAL SHIP MANAGEMENT CO., LTD.</div>
            <div className="company-sub">Tel: 051-714-1877 | Fax: 051-714-1878</div>
          </div>
          <div className="resume-title">CREW RESUME</div>
        </div>

        {/* 프로필 + 기본정보 */}
        <div className="section">
          <div className="section-title">Personal Information</div>
          <div className="profile-block">
            {crew.photo_url
              ? <img src={crew.photo_url} className="profile-photo" alt="crew" />
              : <div className="profile-photo-placeholder">NO PHOTO</div>
            }
            <div className="profile-info">
              <div className="crew-name">{crew.name || '-'}</div>
              <div className="crew-rank">{rankName || crew.rank || '-'}</div>
              <div className="info-grid">
                <div className="info-item"><span className="info-label">영문이름</span><span className="info-value">{crew.name_english || '-'}</span></div>
                <div className="info-item"><span className="info-label">한자이름</span><span className="info-value">{crew.name_chinese || '-'}</span></div>
                <div className="info-item"><span className="info-label">국적</span><span className="info-value">{crew.nationality || '-'}</span></div>
                <div className="info-item"><span className="info-label">생년월일</span><span className="info-value">{fmt(crew.date_of_birth)}</span></div>
                <div className="info-item"><span className="info-label">출생지</span><span className="info-value">{crew.place_of_birth || '-'}</span></div>
                <div className="info-item"><span className="info-label">혈액형</span><span className="info-value">{crew.blood_type || '-'}</span></div>
                <div className="info-item"><span className="info-label">결혼여부</span><span className="info-value">{crew.marital_status ? MARITAL_LABELS[crew.marital_status] || crew.marital_status : '-'}</span></div>
                <div className="info-item"><span className="info-label">자녀수</span><span className="info-value">{crew.children_count ?? '-'}</span></div>
                <div className="info-item"><span className="info-label">종교</span><span className="info-value">{crew.religion || '-'}</span></div>
                <div className="info-item"><span className="info-label">연락처</span><span className="info-value">{crew.phone || '-'}</span></div>
                <div className="info-item"><span className="info-label">이메일</span><span className="info-value">{crew.email || '-'}</span></div>
                <div className="info-item"><span className="info-label">SID</span><span className="info-value">{crew.sid || '-'}</span></div>
              </div>
            </div>
          </div>
        </div>

        {/* 신체 정보 */}
        <div className="section">
          <div className="section-title">Physical Data</div>
          <div className="info-grid">
            <div className="info-item"><span className="info-label">키 (Height)</span><span className="info-value">{crew.height ? `${crew.height} cm` : '-'}</span></div>
            <div className="info-item"><span className="info-label">몸무게 (Weight)</span><span className="info-value">{crew.weight ? `${crew.weight} kg` : '-'}</span></div>
            <div className="info-item"><span className="info-label">혈액형</span><span className="info-value">{crew.blood_type || '-'}</span></div>
            <div className="info-item"><span className="info-label">눈 색</span><span className="info-value">{crew.eye_color || '-'}</span></div>
            <div className="info-item"><span className="info-label">신발 사이즈</span><span className="info-value">{crew.shoe_size ? `${crew.shoe_size} mm` : '-'}</span></div>
            <div className="info-item"><span className="info-label">작업복 사이즈</span><span className="info-value">{crew.coverall_size || '-'}</span></div>
            <div className="info-item"><span className="info-label">의류 사이즈</span><span className="info-value">{crew.clothing_size || '-'}</span></div>
            <div className="info-item"><span className="info-label">흡연</span><span className="info-value">{crew.smoking === true ? '흡연' : crew.smoking === false ? '비흡연' : '-'}</span></div>
            <div className="info-item"><span className="info-label">음주</span><span className="info-value">{crew.drinking === true ? '음주' : crew.drinking === false ? '비음주' : '-'}</span></div>
          </div>
        </div>

        {/* 서류 번호 */}
        <div className="section">
          <div className="section-title">Documents</div>
          <div className="info-grid">
            <div className="info-item"><span className="info-label">여권 번호</span><span className="info-value">{crew.passport_number || '-'}</span></div>
            <div className="info-item"><span className="info-label">여권 만료일</span><span className="info-value">{fmt(crew.passport_expiry)}</span></div>
            <div className="info-item" style={{ gridColumn: 'span 1' }} />
            <div className="info-item"><span className="info-label">선원수첩 (국내)</span><span className="info-value">{crew.seaman_book_number || '-'}</span></div>
            <div className="info-item"><span className="info-label">국내 만료일</span><span className="info-value">{fmt(crew.seaman_book_expiry)}</span></div>
            <div className="info-item" />
            <div className="info-item"><span className="info-label">선원수첩 (국제)</span><span className="info-value">{crew.seaman_book_flag_number || '-'}</span></div>
            <div className="info-item"><span className="info-label">국제 만료일</span><span className="info-value">{fmt(crew.seaman_book_flag_expiry)}</span></div>
            <div className="info-item" />
          </div>
        </div>

        {/* 언어 능력 */}
        <div className="section">
          <div className="section-title">Language Skills</div>
          <div className="info-grid">
            <div className="info-item"><span className="info-label">영어 읽기/쓰기</span><span className="info-value">{crew.english_read_write ? LEVEL_LABELS[crew.english_read_write] || crew.english_read_write : '-'}</span></div>
            <div className="info-item"><span className="info-label">영어 말하기/듣기</span><span className="info-value">{crew.english_speak_listen ? LEVEL_LABELS[crew.english_speak_listen] || crew.english_speak_listen : '-'}</span></div>
            <div className="info-item"><span className="info-label">기타 언어</span><span className="info-value">{crew.other_languages || '-'}</span></div>
          </div>
          {crew.job_ability && (
            <div className="info-item" style={{ marginTop: 2 }}><span className="info-label">업무 능력</span><span className="info-value">{crew.job_ability}</span></div>
          )}
          {crew.motivation && (
            <div className="info-item" style={{ marginTop: 2 }}><span className="info-label">지원 동기</span><span className="info-value">{crew.motivation}</span></div>
          )}
        </div>

        {/* 건강/신체검사 */}
        <div className="section">
          <div className="section-title">Health & Medical</div>
          <div className="info-grid">
            <div className="info-item">
              <span className="info-label">신체검사일</span>
              <span className="info-value">{fmt(crew.physical_exam_date)}</span>
            </div>
            <div className="info-item">
              <span className="info-label">신체검사 결과</span>
              <span className={`info-value ${crew.physical_exam_result === 'fit' ? 'result-pass' : crew.physical_exam_result === 'unfit' ? 'result-fail' : ''}`}>
                {crew.physical_exam_result === 'fit' ? 'FIT' : crew.physical_exam_result === 'unfit' ? 'UNFIT' : '-'}
              </span>
            </div>
            <div className="info-item" />
            <div className="info-item">
              <span className="info-label">약물/알코올 검사일</span>
              <span className="info-value">{fmt(crew.drug_test_date)}</span>
            </div>
            <div className="info-item">
              <span className="info-label">검사 결과</span>
              <span className={`info-value ${crew.drug_test_result === 'pass' ? 'result-pass' : crew.drug_test_result === 'fail' ? 'result-fail' : ''}`}>
                {crew.drug_test_result === 'pass' ? 'PASS' : crew.drug_test_result === 'fail' ? 'FAIL' : '-'}
              </span>
            </div>
            <div className="info-item" />
            <div className="info-item">
              <span className="info-label">황열병 예방접종</span>
              <span className="info-value">{yesNo(crew.yellow_fever_vaccination)}</span>
            </div>
            <div className="info-item">
              <span className="info-label">접종일</span>
              <span className="info-value">{fmt(crew.yellow_fever_date)}</span>
            </div>
            <div className="info-item" />
          </div>
          {crew.previous_illness && (
            <div className="info-item" style={{ marginTop: 2 }}>
              <span className="info-label">기왕증</span>
              <span className="info-value">{crew.previous_illness}</span>
            </div>
          )}
        </div>

        {/* 보유 증서 */}
        {crew.certificates && crew.certificates.length > 0 && (
          <div className="section">
            <div className="section-title">Certificates & Documents</div>
            <table>
              <thead>
                <tr>
                  <th style={{ width: '35%', textAlign: 'left' }}>증서명</th>
                  <th style={{ width: '18%' }}>번호</th>
                  <th style={{ width: '12%' }}>발급일</th>
                  <th style={{ width: '12%' }}>만료일</th>
                  <th style={{ width: '23%', textAlign: 'left' }}>발급기관</th>
                </tr>
              </thead>
              <tbody>
                {crew.certificates.map((cert, i) => {
                  const isExpired = cert.expiry_date && !cert.no_expiry && new Date(cert.expiry_date) < new Date();
                  return (
                    <tr key={i}>
                      <td>{cert.name}</td>
                      <td style={{ textAlign: 'center' }}>{cert.number || '-'}</td>
                      <td style={{ textAlign: 'center' }}>{fmt(cert.issued_date)}</td>
                      <td style={{ textAlign: 'center' }} className={isExpired ? 'cert-expired' : cert.no_expiry ? '' : 'cert-ok'}>
                        {cert.no_expiry ? '제한없음' : fmt(cert.expiry_date)}
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
          <div className="section">
            <div className="section-title">Sea Service Record</div>
            <table>
              <thead>
                <tr>
                  <th style={{ width: '22%', textAlign: 'left' }}>선박명</th>
                  <th style={{ width: '8%' }}>선종</th>
                  <th style={{ width: '6%' }}>국적</th>
                  <th style={{ width: '7%' }}>GRT</th>
                  <th style={{ width: '8%' }}>직책</th>
                  <th style={{ width: '9%' }}>승선일</th>
                  <th style={{ width: '9%' }}>하선일</th>
                  <th style={{ width: '8%' }}>기간</th>
                  <th style={{ width: '23%', textAlign: 'left' }}>하선 사유</th>
                </tr>
              </thead>
              <tbody>
                {seaService.map((rec, i) => {
                  const months = rec.sign_on_date && rec.sign_off_date
                    ? Math.round((new Date(rec.sign_off_date).getTime() - new Date(rec.sign_on_date).getTime()) / (1000 * 60 * 60 * 24 * 30))
                    : null;
                  return (
                    <tr key={i}>
                      <td>{rec.ship_name}</td>
                      <td style={{ textAlign: 'center' }}>{rec.ship_type || '-'}</td>
                      <td style={{ textAlign: 'center' }}>{rec.flag || '-'}</td>
                      <td style={{ textAlign: 'center' }}>{rec.gross_tonnage?.toLocaleString() || '-'}</td>
                      <td style={{ textAlign: 'center' }}>{rec.rank}{rec.rank_grade ? `(${rec.rank_grade})` : ''}</td>
                      <td style={{ textAlign: 'center' }}>{fmt(rec.sign_on_date)}</td>
                      <td style={{ textAlign: 'center' }}>{rec.sign_off_date ? fmt(rec.sign_off_date) : '현재'}</td>
                      <td style={{ textAlign: 'center' }}>{months != null ? `${months}개월` : '-'}</td>
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
          <div className="section">
            <div className="section-title">Emergency Contacts</div>
            <div className="info-grid">
              {crew.emergency_contacts.map((c, i) => (
                <div key={i} className="info-item">
                  <span className="info-label">{c.relationship} ({i + 1})</span>
                  <span className="info-value">{c.name} / {c.phone}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 푸터 */}
        <div className="footer">
          <span>INK Marine Co., Ltd. — 부산광역시 중구 | Tel: 051-714-1877</span>
          <span>출력일: {new Date().toLocaleDateString('ko-KR')}</span>
        </div>
      </div>
    </>
  );
}
