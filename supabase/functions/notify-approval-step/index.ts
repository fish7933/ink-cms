// 결재 차례가 된 사용자에게 Web Push 알림을 보낸다. 클라이언트(approval-document.service.ts)가
// 문서 생성/승인으로 다음 결재자가 정해질 때마다 { document_id, step_order }를 넘겨 호출한다.
// 서비스 롤 키로 DB를 직접 조회해 수신자를 찾으므로, 클라이언트는 누가 다음 결재자인지 몰라도 된다.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@example.com';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const { document_id, step_order } = await req.json();
    if (!document_id || !step_order) {
      return new Response(JSON.stringify({ error: 'document_id, step_order 필요' }), { status: 400, headers: CORS_HEADERS });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const [{ data: doc }, { data: step }, { count: totalSteps }] = await Promise.all([
      supabase.from('approval_documents').select('title, created_by, document_type_id, org_unit_id, created_at').eq('id', document_id).maybeSingle(),
      supabase.from('approval_document_steps').select('approver_id').eq('document_id', document_id).eq('step_order', step_order).maybeSingle(),
      supabase.from('approval_document_steps').select('id', { count: 'exact', head: true }).eq('document_id', document_id),
    ]);
    if (!doc || !step) {
      return new Response(JSON.stringify({ error: '문서 또는 결재 단계를 찾을 수 없음' }), { status: 404, headers: CORS_HEADERS });
    }

    const { data: subs } = await supabase.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', step.approver_id);
    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { headers: CORS_HEADERS });
    }

    const [{ data: creator }, { data: docType }, { data: orgUnit }] = await Promise.all([
      doc.created_by ? supabase.from('users').select('name').eq('id', doc.created_by).maybeSingle() : Promise.resolve({ data: null }),
      doc.document_type_id ? supabase.from('approval_document_types').select('name').eq('id', doc.document_type_id).maybeSingle() : Promise.resolve({ data: null }),
      doc.org_unit_id ? supabase.from('org_units').select('name').eq('id', doc.org_unit_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);

    const draftedDate = doc.created_at
      ? new Date(doc.created_at).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
      : null;
    const bodyParts = [
      creator?.name ? `${creator.name}${orgUnit?.name ? `(${orgUnit.name})` : ''}님이 상신` : null,
      draftedDate ? `${draftedDate}` : null,
      totalSteps ? `${step_order}/${totalSteps}차 결재` : null,
    ].filter(Boolean);

    const payload = JSON.stringify({
      title: docType?.name ? `[${docType.name}] 결재 요청` : '결재 요청',
      body: `${doc.title}${bodyParts.length > 0 ? ` — ${bodyParts.join(' · ')}` : ''}`,
      url: `/documents/${document_id}`,
    });

    const staleIds: string[] = [];
    let sent = 0;
    await Promise.all(subs.map(async sub => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        sent++;
      } catch (e) {
        // 410/404는 브라우저에서 구독이 만료/취소된 것 — 더 이상 보낼 수 없으니 정리해둔다.
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) staleIds.push(sub.id);
        else console.error('push send failed', sub.id, e);
      }
    }));

    if (staleIds.length > 0) {
      await supabase.from('push_subscriptions').delete().in('id', staleIds);
    }

    return new Response(JSON.stringify({ sent }), { headers: CORS_HEADERS });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: CORS_HEADERS });
  }
});
