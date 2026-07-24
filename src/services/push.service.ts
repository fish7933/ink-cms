import { supabase } from '@/lib/supabase';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

// PushManager.subscribe()가 요구하는 Uint8Array 형식으로 base64url VAPID 공개키를 변환한다.
function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

export async function getNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission;
}

// 이 브라우저/기기에 이미 구독이 등록돼 있는지(알림을 이미 켰는지) 확인한다.
export async function isSubscribed(): Promise<boolean> {
  if (!isPushSupported()) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return false;
  const sub = await reg.pushManager.getSubscription();
  return !!sub;
}

// 알림 권한을 요청하고, 허용되면 구독을 만들어 push_subscriptions에 저장한다.
export async function subscribeToPush(userId: string): Promise<void> {
  if (!isPushSupported()) throw new Error('이 브라우저는 알림을 지원하지 않습니다.');
  if (!VAPID_PUBLIC_KEY) throw new Error('VAPID 공개키가 설정되지 않았습니다.');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('알림 권한이 거부되었습니다.');

  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const json = sub.toJSON();
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: sub.endpoint,
      p256dh: json.keys?.p256dh || '',
      auth: json.keys?.auth || '',
    },
    { onConflict: 'user_id,endpoint' }
  );
  if (error) throw error;
}

// 이 기기의 알림 구독을 끄고 push_subscriptions에서도 지운다.
export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
}

// 결재 차례가 된 결재자에게 알림을 보내달라고 Edge Function을 호출한다. 알림 발송은 부가
// 기능이라 실패해도 결재 처리 자체를 막으면 안 되므로, 호출부에서 실패를 무시할 수 있도록
// 에러를 던지지 않고 콘솔에만 남긴다.
export async function notifyApprovalStep(documentId: string, stepOrder: number): Promise<void> {
  try {
    await supabase.functions.invoke('notify-approval-step', { body: { document_id: documentId, step_order: stepOrder } });
  } catch (e) {
    console.error('결재 알림 발송 실패', e);
  }
}
