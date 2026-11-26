import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import en from '@/i18n/locales/pages/CrewResumeAiRegisterPage/en.json';
import { ArrowLeft, Upload, FileText, Sparkles, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useTabContext } from '@/contexts/TabContext';
import { usePermissions } from '@/hooks/usePermissions';
import { supabase } from '@/lib/supabase';
import { saveAiCrewPrefill, type AiExtractedResumeData } from '@/lib/ai-crew-prefill';

i18n.addResourceBundle('en', 'CrewResumeAiRegisterPage', en, true, true);

type Step = 'upload' | 'review';

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

  const finish = () => {
    if (activeTabId) closeTab(activeTabId);
    else navigate('/crew');
  };

  if (!permissions.loading && !permissions.canCreate) {
    navigate('/crew');
    return null;
  }

  const handleExtract = async () => {
    if (!file) return;
    setExtracting(true);
    setError(null);
    try {
      const fileBase64 = await fileToBase64(file);
      const { data: res, error: fnError } = await supabase.functions.invoke('parse-crew-resume', {
        body: { fileName: file.name, mimeType: file.type, fileBase64 },
      });
      if (fnError) throw fnError;
      if (res?.error) throw new Error(res.error);
      setData(res?.data as AiExtractedResumeData);
      setStep('review');
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setExtracting(false);
    }
  };

  const handleApprove = () => {
    if (!data) return;
    saveAiCrewPrefill(data);
    toast({ title: t('선원 등록 화면으로 이동합니다'), description: t('추출된 내용이 채워진 상태로 열립니다. 저장 전 다시 한 번 확인하세요.') });
    openNewTab('/crew/new', t('선원 등록'), true);
    finish();
  };

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
          <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3">
            {t('AI가 자동으로 추출한 내용입니다. 선원 등록 화면으로 넘어가기 전에 아래 내용을 꼭 확인하세요.')}
          </div>

          <Card>
            <CardHeader><CardTitle className="text-sm">{t('기본 정보')}</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-x-6">
              <Field label={t('이름')} value={data.name} />
              <Field label={t('영문 이름')} value={data.name_english} />
              <Field label={t('생년월일')} value={data.date_of_birth} />
              <Field label={t('국적')} value={data.nationality} />
              <Field label={t('성별')} value={data.gender} />
              <Field label={t('여권번호')} value={data.passport_number} />
              <Field label={t('여권만료일')} value={data.passport_expiry} />
              <Field label={t('선원수첩번호')} value={data.seaman_book_number} />
              <Field label={t('선원수첩만료일')} value={data.seaman_book_expiry} />
              <Field label={t('신장(cm)')} value={data.height_cm} />
              <Field label={t('체중(kg)')} value={data.weight_kg} />
              <Field label={t('혈액형')} value={data.blood_type} />
              <Field label={t('연락처')} value={data.contact_phone} />
              <Field label={t('이메일')} value={data.contact_email} />
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">{t('자격증/증서 ({{count}}건)', { count: data.certificates.length })}</CardTitle></CardHeader>
            <CardContent>
              {data.certificates.length === 0 ? (
                <p className="text-sm text-gray-400">{t('추출된 내용 없음')}</p>
              ) : (
                <div className="overflow-x-auto no-scrollbar">
                  <table className="w-full text-xs whitespace-nowrap">
                    <thead><tr className="border-b bg-gray-50/50">
                      <th className="text-left p-1.5">{t('증서명')}</th><th className="text-left p-1.5">{t('번호')}</th>
                      <th className="text-left p-1.5">{t('발급일')}</th><th className="text-left p-1.5">{t('만료일')}</th><th className="text-left p-1.5">{t('발급기관')}</th>
                    </tr></thead>
                    <tbody>
                      {data.certificates.map((c, i) => (
                        <tr key={i} className="border-b">
                          <td className="p-1.5">{c.name || '-'}</td><td className="p-1.5">{c.number || '-'}</td>
                          <td className="p-1.5">{c.issued_date || '-'}</td><td className="p-1.5">{c.expiry_date || '-'}</td><td className="p-1.5">{c.issuing_authority || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">{t('승선 경력 ({{count}}건)', { count: data.sea_service_records.length })}</CardTitle></CardHeader>
            <CardContent>
              {data.sea_service_records.length === 0 ? (
                <p className="text-sm text-gray-400">{t('추출된 내용 없음')}</p>
              ) : (
                <div className="overflow-x-auto no-scrollbar">
                  <table className="w-full text-xs whitespace-nowrap">
                    <thead><tr className="border-b bg-gray-50/50">
                      <th className="text-left p-1.5">{t('선박명')}</th><th className="text-left p-1.5">{t('선종')}</th>
                      <th className="text-left p-1.5">{t('직급')}</th><th className="text-left p-1.5">{t('승선일')}</th><th className="text-left p-1.5">{t('하선일')}</th>
                    </tr></thead>
                    <tbody>
                      {data.sea_service_records.map((r, i) => (
                        <tr key={i} className="border-b">
                          <td className="p-1.5">{r.ship_name || '-'}</td><td className="p-1.5">{r.ship_type || '-'}</td>
                          <td className="p-1.5">{r.rank || '-'}</td><td className="p-1.5">{r.sign_on_date || '-'}</td><td className="p-1.5">{r.sign_off_date || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-xs text-gray-400 mt-2">{t('승인하면 선원 저장 시 승선 경력(입사 전)으로 함께 등록됩니다.')}</p>
            </CardContent>
          </Card>

          {data.notes_for_reviewer && (
            <Card className="border-amber-300">
              <CardHeader><CardTitle className="text-sm flex items-center gap-1.5 text-amber-700"><FileText className="w-4 h-4" />{t('비고 (AI가 남긴 검토 참고사항)')}</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-amber-800 whitespace-pre-wrap">{data.notes_for_reviewer}</p>
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
