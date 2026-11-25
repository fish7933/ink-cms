// 선원 이력서(PDF/엑셀, 양식이 회사마다 다름)를 업로드하면 Claude로 내용을 읽어 이름/생년월일/
// 국적/여권·선원수첩/신체정보/자격증 목록/승선 경력을 구조화된 JSON으로 뽑아낸다.
// 1단계: 추출만(DB에 아무것도 쓰지 않음) — 클라이언트가 결과를 검토용으로만 쓴다.
// Claude API 키를 브라우저에 두면 그대로 노출되므로, 반드시 이 서버(Edge Function)에서만 호출한다.
import Anthropic from 'npm:@anthropic-ai/sdk@0.75.0';
import { z } from 'npm:zod@4';
import { zodOutputFormat } from 'npm:@anthropic-ai/sdk@0.75.0/helpers/zod';
import * as XLSX from 'npm:xlsx@0.18.5';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 선원 등록 화면(CrewInputPage)의 필드 + 승선 경력(sea_service_records, 별도 테이블) 구조에
// 맞춘 추출 스키마. optional/nullable은 전부 빼고 모든 필드를 required로 둔다 — Claude
// 구조화 출력(output_config.format)은 union/optional 타입이 섞이면 "too many optional
// parameters"(limit 24) 또는 "Schema is too complex"로 거부되는데, 특히 배열 안의 객체에
// optional 필드가 있으면 상태 조합이 커져서 더 쉽게 걸린다. 모르는 값은 문자열은 빈
// 문자열("")로, 숫자는 0으로 채우도록 프롬프트에서 지시한다(검토 단계에서 사람이 직접 입력).
const ExtractedResumeSchema = z.object({
  name: z.string(),
  name_english: z.string(),
  date_of_birth: z.string().describe('YYYY-MM-DD, 모르면 빈 문자열'),
  nationality: z.string().describe('이력서에 적힌 국적 원문 그대로(코드로 변환하지 않음)'),
  gender: z.string(),
  passport_number: z.string(),
  passport_expiry: z.string().describe('YYYY-MM-DD'),
  seaman_book_number: z.string(),
  seaman_book_expiry: z.string().describe('YYYY-MM-DD'),
  height_cm: z.number(),
  weight_kg: z.number(),
  blood_type: z.string(),
  contact_phone: z.string(),
  contact_email: z.string(),
  emergency_contacts: z.array(z.object({
    name: z.string(),
    relationship: z.string(),
    phone: z.string(),
  })),
  certificates: z.array(z.object({
    name: z.string(),
    number: z.string(),
    issued_date: z.string(),
    expiry_date: z.string(),
    issuing_authority: z.string(),
  })),
  sea_service_records: z.array(z.object({
    ship_name: z.string(),
    ship_type: z.string(),
    rank: z.string(),
    sign_on_date: z.string(),
    sign_off_date: z.string(),
  })),
  // 추출 과정에서 애매했거나 사람이 꼭 확인해야 할 부분을 모델이 직접 남기는 메모 — 검토
  // 화면에 그대로 보여줘서 어디를 특히 더 봐야 하는지 알려준다.
  notes_for_reviewer: z.string(),
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
      '이력서에 없는 항목은 추측하지 말고, 문자열 필드는 빈 문자열("")로, 숫자 필드는 0으로 두세요.',
      '날짜는 가능하면 YYYY-MM-DD로 변환하세요.',
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

    // Opus의 사고 시간이 150초를 넘으면 Edge Function의 "idle timeout"(클라이언트로 아무
    // 바이트도 안 나가는 상태)에 걸려 함수가 그대로 죽는다. 단순히 Claude 호출을 스트리밍으로
    // 바꾸는 것만으로는 안 된다 — 그 이벤트를 우리가 안에서만 소비하고 응답은 끝에 한 번에
    // 내려주면 클라이언트 쪽 커넥션은 똑같이 계속 idle이기 때문. 그래서 응답 자체를
    // ReadableStream으로 만들어, Claude가 생각하는 동안에도 주기적으로 빈 바이트(줄바꿈)를
    // 클라이언트에 흘려보내 커넥션을 계속 "활동 중" 상태로 유지한다. 줄바꿈은 JSON
    // 문법상 유효한 공백이라 맨 끝에 붙는 실제 JSON 앞에 섞여도 JSON.parse가 그대로 통과한다.
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const keepAlive = setInterval(() => {
          try { controller.enqueue(encoder.encode('\n')); } catch { /* 이미 닫힌 컨트롤러 */ }
        }, 10000);

        (async () => {
          try {
            const stream = client.messages.stream({
              model: 'claude-opus-5-5',
              max_tokens: 16000,
              messages: [{ role: 'user', content }],
              output_config: { format: zodOutputFormat(ExtractedResumeSchema) },
            });
            for await (const _event of stream) {
              // 이벤트 자체는 쓰지 않음 — 업스트림에서도 활동이 있을 때마다 커넥션이 살아있게 함.
            }
            const message = await stream.finalMessage();

            const textBlock = message.content.find(b => b.type === 'text');
            if (!textBlock || textBlock.type !== 'text') {
              controller.enqueue(encoder.encode(JSON.stringify({ error: '추출 결과를 해석하지 못했습니다', stop_reason: message.stop_reason })));
              return;
            }

            try {
              const parsed = ExtractedResumeSchema.parse(JSON.parse(textBlock.text));
              controller.enqueue(encoder.encode(JSON.stringify({ data: parsed })));
            } catch (e) {
              controller.enqueue(encoder.encode(JSON.stringify({ error: `구조화된 출력 파싱 실패: ${String(e)}` })));
            }
          } catch (e) {
            console.error(e);
            controller.enqueue(encoder.encode(JSON.stringify({ error: String(e) })));
          } finally {
            clearInterval(keepAlive);
            controller.close();
          }
        })();
      },
    });

    return new Response(body, { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: CORS_HEADERS });
  }
});
