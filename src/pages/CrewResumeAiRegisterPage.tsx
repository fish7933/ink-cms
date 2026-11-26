import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import en from '@/i18n/locales/pages/CrewResumeAiRegisterPage/en.json';
import { ArrowLeft, Upload, FileText, Sparkles, AlertTriangle, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useTabContext } from '@/contexts/TabContext';
import { usePermissions } from '@/hooks/usePermissions';
import { supabase } from '@/lib/supabase';
import { sortRanksByDisplayOrder } from '@/lib/rank-order';
import { getCertificateTypes } from '@/services/certificate-type.service';
import { getCertificateCategories } from '@/services/certificate-category.service';
import type { CertificateType } from '@/types/certificate-type';
import type { CertificateCategory } from '@/types/certificate-category';
import type { Rank } from '@/types/models';
import { saveAiCrewPrefill, notesForCategory, type AiExtractedResumeData, type AiCrewPrefillPayload } from '@/lib/ai-crew-prefill';

i18n.addResourceBundle('en', 'CrewResumeAiRegisterPage', en, true, true);

type Step = 'upload' | 'review';

// 증서 매칭 Select에서 "기존 목록과 매칭하지 않고 새 증서로 유지" 선택지.
const CUSTOM_CERT = '__custom__';
// 승선경력 직급 매칭 Select에서 "우리 직급 체계로 바꾸지 않고 이력서 원문 그대로 유지" 선택지.
const KEEP_RAW_RANK = '__keep_raw__';

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as ArrayBuffer;
      const bytes = new Uint8Array(result);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      resolve(btoa(binary));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });

// 각 카드 안에 그 섹션에 해당하는 비고만 나열 — AI가 category로 분류해둔 걸 그대로 믿는다.
function NotesList({ items }: { items: string[] }) {
  const { t } = useTranslation('CrewResumeAiRegisterPage');
  if (items.length === 0) return null;
  return (
    <div className="mt-3 pt-3 border-t border-amber-200/70 bg-amber-50/50 -mx-6 -mb-6 px-6 py-3 rounded-b-lg">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 mb-1.5">
        <FileText className="w-3 h-3" />{t('비고')}
      </div>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2 text-xs text-amber-900">
            <span className="shrink-0 mt-0.5 w-4 h-4 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold flex items-center justify-center">{i + 1}</span>
            <span className="leading-relaxed">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | number }) {
  const empty = value === '' || value === 0;
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-xs text-gray-500 w-28 shrink-0">{label}</span>
      <span className={`text-sm ${empty ? 'text-amber-600' : 'text-gray-900 font-medium'}`}>
        {empty ? '(미확인)' : value}
      </span>
    </div>
  );
}

export default function CrewResumeAiRegisterPage() {
  const { t } = useTranslation('CrewResumeAiRegisterPage');
  const { toast } = useToast();
  const navigate = useNavigate();
  const { activeTabId, closeTab, openNewTab } = useTabContext();
  const permissions = usePermissions('crew_list');

  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AiExtractedResumeData | null>(null);

  // 우리 시스템의 증서/직급 카탈로그 — AI 추출 호출 시 같이 넘겨서 매칭을 시도하게 하고,
  // 중간 점검 화면에서 사람이 최종 확인/선택하는 Select의 선택지로도 그대로 쓴다.
  const [certificateTypes, setCertificateTypes] = useState<CertificateType[]>([]);
  const [certificateCategories, setCertificateCategories] = useState<CertificateCategory[]>([]);
  const [ranks, setRanks] = useState<Rank[]>([]);

  // 증서/직급 매칭을 사람이 확정한 값 — 인덱스는 data.certificates / data.sea_service_records와 동일.
  const [certChoices, setCertChoices] = useState<string[]>([]);
  const [rankChoice, setRankChoice] = useState<string>('');
  const [seaRankChoices, setSeaRankChoices] = useState<string[]>([]);
  // 이력서(엑셀 첨부/PDF 내 JPEG)에서 서버가 찾아낸 증명사진 — Claude 구조화 출력(data)과
  // 별개로 응답에 같이 실려온다.
  const [photoBase64, setPhotoBase64] = useState<string | undefined>(undefined);
  const [photoMime, setPhotoMime] = useState<string | undefined>(undefined);

  useEffect(() => {
    getCertificateTypes(true).then(setCertificateTypes).catch(console.error);
    getCertificateCategories(true).then(setCertificateCategories).catch(console.error);
    supabase.from('ranks').select('*').then(({ data: rd }) => { if (rd) setRanks(sortRanksByDisplayOrder(rd)); });
  }, []);

  const finish = () => {
    if (activeTabId) closeTab(activeTabId);
    else navigate('/crew');
  };

  if (!permissions.loading && !permissions.canCreate) {
    navigate('/crew');
    return null;
  }

  // AI가 내놓은 매칭 제안이 실제 카탈로그에 있는 값일 때만 그대로 쓰고, 아니면 사람이 고르게 둔다.
  const deriveChoicesFromAi = (result: AiExtractedResumeData) => {
    const certNames = new Set(certificateTypes.map(ct => ct.type_name_en));
    const rankCodes = new Set(ranks.map(r => r.rank_code));
    setCertChoices(result.certificates.map(c => (c.matched_certificate_type && certNames.has(c.matched_certificate_type)) ? c.matched_certificate_type : ''));
    const matchedRank = ranks.find(r => r.rank_code === result.suggested_rank_code);
    setRankChoice(matchedRank ? matchedRank.id : '');
    setSeaRankChoices(result.sea_service_records.map(r => (r.matched_rank_code && rankCodes.has(r.matched_rank_code)) ? r.matched_rank_code : KEEP_RAW_RANK));
  };

  const handleExtract = async () => {
    if (!file) return;
    setExtracting(true);
    setError(null);
    try {
      const fileBase64 = await fileToBase64(file);
      const { data: res, error: fnError } = await supabase.functions.invoke('parse-crew-resume', {
        body: {
          fileName: file.name,
          mimeType: file.type,
          fileBase64,
          certificateCatalog: certificateTypes.map(ct => ct.type_name_en),
          rankCatalog: ranks.map(r => ({ code: r.rank_code, name: r.name })),
        },
      });
      if (fnError) throw fnError;
      if (res?.error) throw new Error(res.error);
      const result = res?.data as AiExtractedResumeData;
      setData(result);
      setPhotoBase64(res?.photo_base64);
      setPhotoMime(res?.photo_mime);
      deriveChoicesFromAi(result);
      setStep('review');
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setExtracting(false);
    }
  };

  const allCertsResolved = certChoices.length > 0 && certChoices.every(c => c !== '');

  const handleApprove = () => {
    if (!data) return;
    if (!allCertsResolved) {
      toast({ title: t('증서 매칭을 모두 확인해주세요'), description: t('아직 선택하지 않은 증서가 있습니다. 기존 증서와 매칭하거나 새 증서로 유지할지 골라주세요.'), variant: 'destructive' });
      return;
    }
    const payload: AiCrewPrefillPayload = {
      name: data.name,
      name_english: data.name_english,
      date_of_birth: data.date_of_birth,
      nationality: data.nationality,
      passport_number: data.passport_number,
      passport_expiry: data.passport_expiry,
      seaman_book_number: data.seaman_book_number,
      seaman_book_expiry: data.seaman_book_expiry,
      height_cm: data.height_cm,
      weight_kg: data.weight_kg,
      blood_type: data.blood_type,
      contact_phone: data.contact_phone,
      contact_email: data.contact_email,
      emergency_contacts: data.emergency_contacts,
      certificates: data.certificates.map((c, i) => ({
        name: certChoices[i] === CUSTOM_CERT ? c.name : certChoices[i],
        number: c.number, issued_date: c.issued_date, expiry_date: c.expiry_date, issuing_authority: c.issuing_authority,
      })),
      sea_service_records: data.sea_service_records.map((r, i) => ({
        ship_name: r.ship_name, ship_type: r.ship_type,
        rank: seaRankChoices[i] === KEEP_RAW_RANK ? r.rank : seaRankChoices[i],
        sign_on_date: r.sign_on_date, sign_off_date: r.sign_off_date,
        owner_company_name: r.owner_company_name, ship_manager_name: r.ship_manager_name,
        manning_agency_name: r.manning_agency_name, sign_off_reason: r.sign_off_reason,
        sign_off_reason_id: '',
      })),
      resolved_rank_id: rankChoice,
      photo_base64: photoBase64,
      photo_mime: photoMime,
      notes_for_reviewer: data.notes_for_reviewer,
    };
    saveAiCrewPrefill(payload);
    toast({ title: t('선원 등록 화면으로 이동합니다'), description: t('추출된 내용이 채워진 상태로 열립니다. 저장 전 다시 한 번 확인하세요.') });
    openNewTab('/crew/new', t('선원 등록'), true);
    finish();
  };

  const certCategoryOf = (ct: CertificateType) => certificateCategories.find(cat => cat.code === ct.category);
  const groupedCertTypes = certificateCategories
    .map(cat => ({ cat, items: certificateTypes.filter(ct => ct.category === cat.code) }))
    .filter(g => g.items.length > 0);
  const uncategorizedCertTypes = certificateTypes.filter(ct => !certCategoryOf(ct));

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={finish}><ArrowLeft className="w-5 h-5" /></Button>
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><Sparkles className="w-5 h-5 text-blue-600" />{t('AI로 선원 등록')}</h1>
          <p className="text-sm text-muted-foreground">{t('선원 이력서(PDF/엑셀)를 올리면 AI가 내용을 읽어 등록 기초자료를 미리 채워줍니다.')}</p>
        </div>
      </div>

      {step === 'upload' && (
        <Card>
          <CardHeader><CardTitle className="text-base">{t('이력서 파일 업로드')}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg py-10 cursor-pointer hover:bg-gray-50">
              <Upload className="w-8 h-8 text-gray-400" />
              <span className="text-sm text-gray-600">{file ? file.name : t('PDF 또는 엑셀 파일을 선택하세요')}</span>
              <input
                type="file"
                accept=".pdf,.xlsx,.xls"
                className="hidden"
                onChange={e => { setFile(e.target.files?.[0] || null); setError(null); }}
                disabled={extracting}
              />
            </label>

            {error && (
              <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{t('추출 실패')}: {error}</span>
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={handleExtract} disabled={!file || extracting} className="gap-2">
                {extracting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {extracting ? t('추출 중... (1~2분 정도 걸릴 수 있습니다)') : t('AI로 추출 시작')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'review' && data && (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3">
            <span>{t('AI가 자동으로 추출한 내용입니다. 선원 등록 화면으로 넘어가기 전에 아래 내용을 꼭 확인하세요.')}</span>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1 shrink-0 bg-white" onClick={() => deriveChoicesFromAi(data)}>
              <RotateCcw className="w-3 h-3" />{t('AI 추천값으로 되돌리기')}
            </Button>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-sm">{t('기본 정보')}</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-x-6">
              {photoBase64 && photoMime && (
                <div className="col-span-2 flex items-center gap-3 pb-2 mb-2 border-b">
                  <img src={`data:${photoMime};base64,${photoBase64}`} alt="" className="w-16 h-16 rounded-full object-cover border" />
                  <span className="text-xs text-gray-500">{t('이력서에서 찾은 사진 — 승인하면 선원 등록 화면의 사진으로 자동 반영됩니다.')}</span>
                </div>
              )}
              <Field label={t('이름')} value={data.name} />
              <Field label={t('영문 이름')} value={data.name_english} />
              <Field label={t('생년월일')} value={data.date_of_birth} />
              <Field label={t('국적')} value={data.nationality} />
              <Field label={t('여권번호')} value={data.passport_number} />
              <Field label={t('여권만료일')} value={data.passport_expiry} />
              <Field label={t('선원수첩번호')} value={data.seaman_book_number} />
              <Field label={t('선원수첩만료일')} value={data.seaman_book_expiry} />
              <Field label={t('신장(cm)')} value={data.height_cm} />
              <Field label={t('체중(kg)')} value={data.weight_kg} />
              <Field label={t('혈액형')} value={data.blood_type} />
              <Field label={t('연락처')} value={data.contact_phone} />
              <Field label={t('이메일')} value={data.contact_email} />
              <div className="col-span-2"><NotesList items={notesForCategory(data.notes_for_reviewer, 'basic_info')} /></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">{t('직급')}</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {data.suggested_rank_source && (
                <p className="text-xs text-gray-500">{t('AI 추천 근거')}: {data.suggested_rank_source}</p>
              )}
              <Select value={rankChoice || '_none'} onValueChange={v => setRankChoice(v === '_none' ? '' : v)}>
                <SelectTrigger className="h-9 max-w-xs"><SelectValue placeholder={t('직급 선택')} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">{t('선택 안함')}</SelectItem>
                  {ranks.map(r => <SelectItem key={r.id} value={r.id}>{r.rank_code} ({r.name})</SelectItem>)}
                </SelectContent>
              </Select>
              {!rankChoice && (
                <p className="text-xs text-amber-600">{t('직급을 확인/선택하지 않으면 선원 등록 화면에서 직접 선택해야 합니다.')}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">{t('비상연락처 ({{count}}건)', { count: data.emergency_contacts.length })}</CardTitle></CardHeader>
            <CardContent>
              {data.emergency_contacts.length === 0 ? (
                <p className="text-sm text-gray-400">{t('추출된 내용 없음')}</p>
              ) : (
                <table className="w-full text-xs">
                  <thead><tr className="border-b bg-gray-50/50">
                    <th className="text-left p-1.5">{t('이름')}</th><th className="text-left p-1.5">{t('관계')}</th><th className="text-left p-1.5">{t('연락처')}</th>
                  </tr></thead>
                  <tbody>
                    {data.emergency_contacts.map((c, i) => (
                      <tr key={i} className="border-b"><td className="p-1.5">{c.name || '-'}</td><td className="p-1.5">{c.relationship || '-'}</td><td className="p-1.5">{c.phone || '-'}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
              <NotesList items={notesForCategory(data.notes_for_reviewer, 'emergency_contacts')} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{t('자격증/증서 ({{count}}건)', { count: data.certificates.length })}</CardTitle>
              <p className="text-xs text-gray-500 mt-1">{t('AI가 확신하지 못한 증서는 직접 어떤 증서인지 선택해야 합니다(또는 새 증서로 유지).')}</p>
            </CardHeader>
            <CardContent>
              {data.certificates.length === 0 ? (
                <p className="text-sm text-gray-400">{t('추출된 내용 없음')}</p>
              ) : (
                <div className="space-y-2">
                  {data.certificates.map((c, i) => {
                    const unresolved = certChoices[i] === '';
                    const aiMatched = c.matched_certificate_type && certChoices[i] === c.matched_certificate_type;
                    return (
                      <div key={i} className={`grid grid-cols-[1fr_auto] gap-3 items-center p-2 rounded-md border ${unresolved ? 'border-red-300 bg-red-50/40' : 'border-gray-100'}`}>
                        <div className="text-xs space-y-0.5">
                          <div className="font-medium text-gray-800">{c.name || t('(증서명 미확인)')}</div>
                          <div className="text-gray-400">
                            {t('번호')} {c.number || '-'} · {t('발급일')} {c.issued_date || '-'} · {t('만료일')} {c.expiry_date || '-'}
                            {c.issuing_authority && ` · ${c.issuing_authority}`}
                          </div>
                          {aiMatched && <div className="text-emerald-600 text-[11px]">{t('AI 추천 매칭')}</div>}
                        </div>
                        <Select value={certChoices[i] || ''} onValueChange={v => setCertChoices(prev => prev.map((x, idx) => idx === i ? v : x))}>
                          <SelectTrigger className={`h-8 text-xs w-56 ${unresolved ? 'border-red-400' : ''}`}>
                            <SelectValue placeholder={t('증서 선택 필요')} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={CUSTOM_CERT} className="text-xs">{t('새 증서로 유지(직접 입력)')}</SelectItem>
                            {groupedCertTypes.map(g => (
                              <SelectGroup key={g.cat.code}>
                                <SelectLabel className="text-xs">{g.cat.name}</SelectLabel>
                                {g.items.map(ct => <SelectItem key={ct.id} value={ct.type_name_en} className="text-xs">{ct.type_name_en}</SelectItem>)}
                              </SelectGroup>
                            ))}
                            {uncategorizedCertTypes.length > 0 && (
                              <SelectGroup>
                                <SelectLabel className="text-xs">{t('기타')}</SelectLabel>
                                {uncategorizedCertTypes.map(ct => <SelectItem key={ct.id} value={ct.type_name_en} className="text-xs">{ct.type_name_en}</SelectItem>)}
                              </SelectGroup>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
                </div>
              )}
              <NotesList items={notesForCategory(data.notes_for_reviewer, 'certificates')} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">{t('승선 경력 ({{count}}건)', { count: data.sea_service_records.length })}</CardTitle></CardHeader>
            <CardContent>
              {data.sea_service_records.length === 0 ? (
                <p className="text-sm text-gray-400">{t('추출된 내용 없음')}</p>
              ) : (
                <div className="space-y-2">
                  {data.sea_service_records.map((r, i) => (
                    <div key={i} className="grid grid-cols-[1fr_auto] gap-3 items-center p-2 rounded-md border border-gray-100">
                      <div className="text-xs space-y-0.5">
                        <div className="font-medium text-gray-800">{r.ship_name || '-'} <span className="text-gray-400 font-normal">({r.ship_type || '-'})</span></div>
                        <div className="text-gray-400">{t('이력서 직급 표기')}: {r.rank || '-'} · {r.sign_on_date || '-'} ~ {r.sign_off_date || '-'}</div>
                        {(r.owner_company_name || r.ship_manager_name || r.manning_agency_name || r.sign_off_reason) && (
                          <div className="text-gray-400">
                            {[r.owner_company_name, r.ship_manager_name, r.manning_agency_name, r.sign_off_reason].filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </div>
                      <Select value={seaRankChoices[i] || KEEP_RAW_RANK} onValueChange={v => setSeaRankChoices(prev => prev.map((x, idx) => idx === i ? v : x))}>
                        <SelectTrigger className="h-8 text-xs w-56"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={KEEP_RAW_RANK} className="text-xs">{t('원문 그대로 유지')} ({r.rank || '-'})</SelectItem>
                          {ranks.map(rk => <SelectItem key={rk.id} value={rk.rank_code} className="text-xs">{rk.rank_code} ({rk.name})</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-gray-400 mt-2">{t('승인하면 선원 저장 시 승선 경력(입사 전)으로 함께 등록됩니다.')}</p>
              <NotesList items={notesForCategory(data.notes_for_reviewer, 'sea_service')} />
            </CardContent>
          </Card>

          {notesForCategory(data.notes_for_reviewer, 'other').length > 0 && (
            <Card className="border-amber-300 overflow-hidden">
              <CardHeader className="bg-amber-50/60">
                <CardTitle className="text-sm flex items-center gap-1.5 text-amber-700"><FileText className="w-4 h-4" />{t('비고 (그 외 참고사항)')}</CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <ul className="space-y-3">
                  {notesForCategory(data.notes_for_reviewer, 'other').map((item, i) => (
                    <li key={i} className="flex gap-3 text-sm text-amber-900">
                      <span className="shrink-0 mt-0.5 w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-[11px] font-bold flex items-center justify-center">{i + 1}</span>
                      <span className="leading-relaxed pt-px">{item}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setStep('upload'); setData(null); setFile(null); }}>{t('다시 업로드')}</Button>
            <Button onClick={handleApprove} className="gap-2"><Sparkles className="w-4 h-4" />{t('승인 — 선원 등록 화면으로 진행')}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
