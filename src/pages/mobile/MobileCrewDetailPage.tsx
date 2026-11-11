import type { ReactNode } from 'react';
import type { CrewWithDetails } from '@/services/crew.service';

interface Props {
  crew: CrewWithDetails;
}

function Row({ label, value }: { label: string; value?: string | number | null }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-3 py-2 border-b border-gray-100 last:border-0">
      <span className="text-xs text-gray-400 shrink-0">{label}</span>
      <span className="text-sm text-gray-800 text-right">{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold text-gray-500 mb-1.5">{title}</div>
      {children}
    </div>
  );
}

// 선원 상세 — 조회 전용(모바일 범위는 조회만이라 CrewDetailPanel처럼 편집 가능한 풀 프로필을
// 그대로 쓰지 않고, 현장에서 가장 자주 확인할 핵심 정보만 뽑아 보여준다).
export default function MobileCrewDetailPage({ crew: c }: Props) {
  const effRankCode = c.is_active_onboard ? c.rank_code : (c.pending_rank_code || c.rank_code);
  const effShipName = c.is_active_onboard ? c.current_ship_name : (c.pending_ship_name || c.current_ship_name);
  const effOwnerName = c.is_active_onboard ? c.owner_name : (c.pending_owner_name || c.owner_name);

  const soonExpiring = (c.certificates || []).filter(cert => !cert.no_expiry && cert.expiry_date);

  return (
    <div className="space-y-3">
      <div className="rounded-xl border bg-white p-4 shadow-sm flex items-center gap-3">
        {c.photo_url ? (
          <img src={c.photo_url} alt="" className="w-14 h-14 rounded-full object-cover shrink-0" />
        ) : (
          <div className="w-14 h-14 rounded-full bg-gray-100 shrink-0" />
        )}
        <div className="min-w-0">
          <div className="text-base font-bold text-gray-900 truncate">{c.name}</div>
          <div className="text-xs text-gray-500 truncate">{effRankCode || '-'} · {effShipName || '대기 중'}</div>
          {effOwnerName && <div className="text-xs text-gray-400 truncate">{effOwnerName}</div>}
        </div>
      </div>

      <Section title="기본 정보">
        <Row label="생년월일" value={c.date_of_birth} />
        <Row label="국적" value={c.nationality} />
        <Row label="연락처" value={c.contact_phone || c.phone} />
        <Row label="이메일" value={c.contact_email || c.email} />
      </Section>

      <Section title="서류 정보">
        <Row label="여권번호" value={c.passport_number} />
        <Row label="여권 만료일" value={c.passport_expiry} />
        <Row label="선원수첩번호" value={c.seaman_book_number} />
        <Row label="선원수첩 만료일" value={c.seaman_book_expiry} />
      </Section>

      {soonExpiring.length > 0 && (
        <Section title="증서">
          {soonExpiring.map((cert, i) => (
            <Row key={i} label={cert.name} value={cert.expiry_date} />
          ))}
        </Section>
      )}

      {c.emergency_contacts && c.emergency_contacts.length > 0 && (
        <Section title="비상 연락처">
          {c.emergency_contacts.map((ec, i) => (
            <Row key={i} label={`${ec.name} (${ec.relationship})`} value={ec.phone} />
          ))}
        </Section>
      )}
    </div>
  );
}
