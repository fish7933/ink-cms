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
}

export interface AiExtractedEmergencyContact {
  name: string;
  relationship: string;
  phone: string;
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
  notes_for_reviewer: string;
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
  sea_service_records: { ship_name: string; ship_type: string; rank: string; sign_on_date: string; sign_off_date: string }[];
  // 선원 등록 화면의 formData.rank_id로 바로 쓸 직급 UUID — 사람이 확정 못 했으면 빈 문자열.
  resolved_rank_id: string;
  notes_for_reviewer: string;
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
