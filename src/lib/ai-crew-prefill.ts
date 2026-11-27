// 이력서 AI 추출(parse-crew-resume Edge Function) 결과를 선원 등록 화면(CrewDetailPanel, 신규
// 등록 모드)에 넘겨주기 위한 임시 저장소. 탭 시스템은 경로(path) 문자열만으로 화면을 열기
// 때문에 router state로 직접 못 넘기므로, sessionStorage에 한 번만 담아두고 등록 화면이
// 마운트되자마자 읽은 뒤 바로 지운다(다음에 '새 선원 등록'을 열 때 엉뚱하게 재사용되지 않도록).
const STORAGE_KEY = 'aiCrewResumePrefill';

export interface AiExtractedCertificate {
  name: string;
  number: string;
  issued_date: string;
  expiry_date: string;
  issuing_authority: string;
  // 우리 증서 목록(certificate_types.type_name_en) 중 AI가 확신한 매칭 — 확신 없으면 빈 문자열.
  // 중간 점검 화면에서 사람이 최종 확인/선택한다(review-page.tsx 참고).
  matched_certificate_type: string;
}

export interface AiExtractedSeaServiceRecord {
  ship_name: string;
  ship_type: string;
  rank: string;
  sign_on_date: string;
  sign_off_date: string;
  // 우리 직급 체계(ranks.rank_code) 중 AI가 확신한 매칭 — 확신 없으면 빈 문자열.
  matched_rank_code: string;
  owner_company_name: string;
  ship_manager_name: string;
  manning_agency_name: string;
  sign_off_reason: string;
  // 우리 선종 카탈로그(ship_types.name) 중 AI가 확신한 매칭 — 확신 없으면 빈 문자열.
  matched_ship_type: string;
  // 우리 하선사유 목록(sign_off_reasons.name) 중 AI가 확신한 매칭 — 확신 없으면 빈 문자열.
  matched_sign_off_reason: string;
}

// 선원 등록 화면(신규 등록)의 "승선 경력" 탭에서 저장 전까지 사람이 직접 추가/수정/삭제할 수
// 있는 행 하나의 모양 — AI가 못 찾은 항목도 직접 입력해 추가할 수 있어 전부 필수는 아니다.
export interface PendingSeaServiceRecord {
  ship_name: string;
  ship_type: string;
  rank: string;
  sign_on_date: string;
  sign_off_date: string;
  owner_company_name: string;
  ship_manager_name: string;
  manning_agency_name: string;
  // AI가 추출한 하선 사유 원문(참고용 — 그대로 저장하지 않음, 우리 하선사유 목록과 자동
  // 매칭을 하지 않으므로 사람이 아래 sign_off_reason_id로 직접 골라야 한다).
  sign_off_reason: string;
  // 하선사유 목록(sign_off_reasons 테이블)에서 사람이 고른 항목 — 실제 저장은 이 id로.
  sign_off_reason_id: string;
  // 선원 등록 화면(CrewDetailPanel)에서만 쓰는 UI 전용 플래그 — ship_name이 우리가 관리하는
  // 선박(ships 테이블)과 일치할 때, "이 경력을 당사 승선 경력(company_assignment)으로
  // 등록할지" 사람이 고른 값. true면 저장 시 record_type이 company_assignment로, ship_id가
  // 그 선박의 id로 들어간다(선주/플릿은 그 선박의 owner_id/fleet_id에서 역추적됨).
  treat_as_company_assignment?: boolean;
}

export interface AiExtractedEmergencyContact {
  name: string;
  relationship: string;
  phone: string;
}

// 비고(notes_for_reviewer) 항목 하나 — 어느 탭/섹션 아래에 보여줄지 AI가 직접 분류한다.
export type ReviewerNoteCategory = 'basic_info' | 'certificates' | 'emergency_contacts' | 'sea_service' | 'other';
export interface ReviewerNote {
  category: string; // ReviewerNoteCategory 중 하나가 와야 하지만, 모델이 다른 값을 줄 수도 있어 string으로 받고 사용처에서 필터링
  text: string;
}

// parse-crew-resume Edge Function이 그대로 돌려주는 원본 추출 결과(1:1 대응).
export interface AiExtractedResumeData {
  name: string;
  name_english: string;
  date_of_birth: string;
  nationality: string;
  gender: string;
  passport_number: string;
  passport_expiry: string;
  seaman_book_number: string;
  seaman_book_expiry: string;
  height_cm: number;
  weight_kg: number;
  blood_type: string;
  contact_phone: string;
  contact_email: string;
  emergency_contacts: AiExtractedEmergencyContact[];
  certificates: AiExtractedCertificate[];
  sea_service_records: AiExtractedSeaServiceRecord[];
  suggested_rank_code: string;
  suggested_rank_source: string;
  notes_for_reviewer: ReviewerNote[];
}

// 중간 점검 화면에서 사람이 증서/직급 매칭을 확정한 뒤 선원 등록 화면으로 넘기는 최종 결과.
// certificates[].name / sea_service_records[].rank는 이미 최종 확정된 값(카탈로그 이름·코드
// 또는 원문 유지)이라, CrewDetailPanel은 그대로 폼에 채우기만 하면 된다.
export interface AiCrewPrefillPayload {
  name: string;
  name_english: string;
  date_of_birth: string;
  nationality: string;
  passport_number: string;
  passport_expiry: string;
  seaman_book_number: string;
  seaman_book_expiry: string;
  height_cm: number;
  weight_kg: number;
  blood_type: string;
  contact_phone: string;
  contact_email: string;
  emergency_contacts: AiExtractedEmergencyContact[];
  certificates: { name: string; number: string; issued_date: string; expiry_date: string; issuing_authority: string }[];
  sea_service_records: PendingSeaServiceRecord[];
  // 선원 등록 화면의 formData.rank_id로 바로 쓸 직급 UUID — 사람이 확정 못 했으면 빈 문자열.
  resolved_rank_id: string;
  // 이력서(엑셀 첨부파일 또는 PDF 내 JPEG)에서 찾아낸 증명사진 — 있으면 선원 등록 화면의
  // "사진 업로드"가 이미 된 상태로 만들어준다. 못 찾았으면 둘 다 undefined.
  photo_base64?: string;
  photo_mime?: string;
  notes_for_reviewer: ReviewerNote[];
}

// 비고를 지정한 카테고리(기본정보/증서/비상연락망/승선경력 등)에 해당하는 것만 걸러서 반환 —
// 중간 점검 화면의 각 카드, 선원 등록 화면의 각 탭이 자기 섹션에 해당하는 비고만 보여줄 때 쓴다.
export function notesForCategory(notes: ReviewerNote[], category: ReviewerNoteCategory): string[] {
  return notes.filter(n => n.category === category).map(n => n.text).filter(Boolean);
}

export function saveAiCrewPrefill(data: AiCrewPrefillPayload): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// 한 번 읽으면 바로 지운다(다음 '새 선원 등록'에 잘못 재사용되지 않도록) — 다만 읽은 값은
// 호출한 쪽(CrewDetailPanel)이 메모리에 들고 있다가 "AI 추출값으로 되돌리기"에 재사용한다.
export function consumeAiCrewPrefill(): AiCrewPrefillPayload | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(STORAGE_KEY);
    return JSON.parse(raw) as AiCrewPrefillPayload;
  } catch {
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  }
}
