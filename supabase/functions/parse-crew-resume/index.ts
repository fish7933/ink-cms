// 선원 이력서(PDF/엑셀, 양식이 회사마다 다름)를 업로드하면 Claude로 내용을 읽어 이름/생년월일/
// 국적/여권·선원수첩/신체정보/자격증 목록/승선 경력을 구조화된 JSON으로 뽑아낸다.
// 1단계: 추출만(DB에 아무것도 쓰지 않음) — 클라이언트가 결과를 검토용으로만 쓴다.
// Claude API 키를 브라우저에 두면 그대로 노출되므로, 반드시 이 서버(Edge Function)에서만 호출한다.
import Anthropic from 'npm:@anthropic-ai/sdk@0.75.0';
import { z } from 'npm:zod@3';
import { zodOutputFormat } from 'npm:@anthropic-ai/sdk@0.75.0/helpers/zod';
import * as XLSX from 'npm:xlsx@0.18.5';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 선원 등록 화면(CrewInputPage)의 필드 + 승선 경력(sea_service_records, 별도 테이블) 구조에
// 맞춘 추출 스키마. 이력서에 없는 값은 null — 추측해서 채우지 않는다(검토 단계에서 사람이
// 직접 입력하게 함).
const ExtractedResumeSchema = z.object({
  name: z.string().nullable(),
  name_english: z.string().nullable(),
  date_of_birth: z.string().nullable().describe('YYYY-MM-DD, 확실하지 않으면 null'),
  nationality: z.string().nullable().describe('이력서에 적힌 국적 원문 그대로(코드로 변환하지 않음)'),
  gender: z.string().nullable(),
  passport_number: z.string().nullable(),
  passport_expiry: z.string().nullable().describe('YYYY-MM-DD'),
  seaman_book_number: z.string().nullable(),
  seaman_book_expiry: z.string().nullable().describe('YYYY-MM-DD'),
  height_cm: z.number().nullable(),
  weight_kg: z.number().nullable(),
  blood_type: z.string().nullable(),
  contact_phone: z.string().nullable(),
  contact_email: z.string().nullable(),
  emergency_contacts: z.array(z.object({
    name: z.string(),
    relationship: z.string().nullable(),
    phone: z.string().nullable(),
  })),
  certificates: z.array(z.object({
    name: z.string(),
    number: z.string().nullable(),
    issued_date: z.string().nullable(),
    expiry_date: z.string().nullable(),
    issuing_authority: z.string().nullable(),
  })),
  sea_service_records: z.array(z.object({
    ship_name: z.string(),
    ship_type: z.string().nullable(),
    rank: z.string().nullable(),
    sign_on_date: z.string().nullable(),
    sign_off_date: z.string().nullable(),
  })),
  // 추출 과정에서 애매했거나 사람이 꼭 확인해야 할 부분을 모델이 직접 남기는 메모 — 검토
  // 화면에 그대로 보여줘서 어디를 특히 더 봐야 하는지 알려준다.
  notes_for_reviewer: z.string().nullable(),
});

// 엑셀은 Claude에 직접 문서로 못 넘기므로, 모든 시트를 텍스트(탭 구분)로 변환한다.
function excelToText(bytes: Uint8Array): string {
  const workbook = XLSX.read(bytes, { type: 'array' });
  const parts: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet, { FS: '\t' });
    parts.push(`--- 시트: ${sheetName} ---\n${csv}`);
  }
  return parts.join('\n\n');
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const { fileName, mimeType, fileBase64 } = await req.json();
    if (!fileBase64 || !mimeType) {
      return new Response(JSON.stringify({ error: 'fileBase64, mimeType가 필요합니다' }), { status: 400, headers: CORS_HEADERS });
    }

    const isPdf = mimeType === 'application/pdf';
    const isExcel = mimeType.includes('spreadsheet') || mimeType.includes('excel') || /\.(xlsx?|xlsm)$/i.test(fileName || '');

    const instruction = [
      '아래는 선원(해기사/부원) 이력서입니다. 양식은 회사마다 다를 수 있습니다.',
      '이름, 생년월일, 국적, 여권/선원수첩 번호·만료일, 신체정보(신장/체중/혈액형), 연락처,',
      '비상연락처, 자격증(증서) 목록, 승선 경력(선박명/직급/승선일/하선일) 을 최대한 정확히 뽑아주세요.',
      '이력서에 없는 항목은 추측하지 말고 null로 두세요. 날짜는 가능하면 YYYY-MM-DD로 변환하세요.',
    ].join(' ');

    const content: Anthropic.MessageParam['content'] = isPdf
      ? [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileBase64 } },
          { type: 'text', text: instruction },
        ]
      : isExcel
        ? [
            { type: 'text', text: `${instruction}\n\n--- 이력서 내용(엑셀을 텍스트로 변환함) ---\n${excelToText(Uint8Array.from(atob(fileBase64), c => c.charCodeAt(0)))}` },
          ]
        : null;

    if (!content) {
      return new Response(JSON.stringify({ error: `지원하지 않는 파일 형식입니다: ${mimeType} (PDF 또는 엑셀만 가능)` }), { status: 400, headers: CORS_HEADERS });
    }

    const response = await client.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 8000,
      messages: [{ role: 'user', content }],
      output_config: { format: zodOutputFormat(ExtractedResumeSchema) },
    });

    if (!response.parsed_output) {
      return new Response(JSON.stringify({ error: '추출 결과를 해석하지 못했습니다', stop_reason: response.stop_reason }), { status: 502, headers: CORS_HEADERS });
    }

    return new Response(JSON.stringify({ data: response.parsed_output }), { headers: CORS_HEADERS });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: CORS_HEADERS });
  }
});
