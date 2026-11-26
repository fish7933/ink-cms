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
}

export interface AiExtractedSeaServiceRecord {
  ship_name: string;
  ship_type: string;
  rank: string;
  sign_on_date: string;
  sign_off_date: string;
}

export interface AiExtractedEmergencyContact {
  name: string;
  relationship: string;
  phone: string;
}

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
  notes_for_reviewer: string;
}

export function saveAiCrewPrefill(data: AiExtractedResumeData): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// 한 번 읽으면 바로 지운다 — 선원 등록 화면이 마운트될 때 딱 한 번만 적용되어야 한다.
export function consumeAiCrewPrefill(): AiExtractedResumeData | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(STORAGE_KEY);
    return JSON.parse(raw) as AiExtractedResumeData;
  } catch {
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  }
}
