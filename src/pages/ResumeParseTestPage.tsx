import { useState } from 'react';
import { supabase } from '@/lib/supabase';

// 이력서 AI 추출 1단계 테스트 화면 — DB에 아무것도 쓰지 않고, Edge Function이 뽑아낸 JSON을
// 그대로 보여주기만 한다. 추출 품질을 실제 이력서 샘플로 확인하기 위한 용도(메뉴에는 안 올림,
// 주소로 직접 접속). 2단계에서 CrewInputPage 쪽으로 옮겨간다.
export default function ResumeParseTestPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');

  const handleFile = async (file: File) => {
    setLoading(true);
    setError(null);
    setResult(null);
    setFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const fileBase64 = btoa(binary);

      const { data, error: fnError } = await supabase.functions.invoke('parse-crew-resume', {
        body: { fileName: file.name, mimeType: file.type, fileBase64 },
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      setResult(data?.data ?? data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <h1 className="text-lg font-bold">이력서 AI 추출 테스트 (1단계 — 저장 안 함)</h1>
      <p className="text-sm text-gray-500">PDF 또는 엑셀 이력서를 올리면 추출된 JSON을 그대로 보여줍니다.</p>
      <input
        type="file"
        accept=".pdf,.xlsx,.xls"
        onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
        disabled={loading}
        className="block"
      />
      {fileName && <p className="text-xs text-gray-400">파일: {fileName}</p>}
      {loading && <p className="text-sm text-blue-600">추출 중... (최대 1분 정도 걸릴 수 있습니다)</p>}
      {error && <p className="text-sm text-red-600">오류: {error}</p>}
      {result !== null && (
        <pre className="bg-gray-50 border rounded p-4 text-xs overflow-auto whitespace-pre-wrap">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
