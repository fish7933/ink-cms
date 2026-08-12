import { getFileStorageSettings } from '@/services/file-storage-settings.service';
import type { FileStorageSettings } from '@/types/file-storage';

// 설정을 매번 DB에서 읽지 않도록 짧게 캐시한다 — 업로드/다운로드마다 조회하면 느려짐.
let cached: { settings: FileStorageSettings | null; at: number } | null = null;
const CACHE_MS = 30000;

async function getActiveSettings(): Promise<FileStorageSettings | null> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.settings;
  const s = await getFileStorageSettings();
  const active = s && s.is_active && s.endpoint_url && s.bucket && s.access_key_id && s.secret_access_key ? s : null;
  cached = { settings: active, at: Date.now() };
  return active;
}

export function invalidateFileStorageCache() {
  cached = null;
}

function objectUrl(settings: FileStorageSettings, key: string): string {
  const endpoint = settings.endpoint_url!.replace(/\/$/, '');
  if (settings.path_style_access) return `${endpoint}/${settings.bucket}/${key}`;
  const url = new URL(endpoint);
  return `${url.protocol}//${settings.bucket}.${url.host}/${key}`;
}

// bucket/path를 합쳐 하나의 오브젝트 키로 쓴다 — Supabase는 버킷이 분리돼 있지만 S3 호환
// 저장소는 버킷 하나(설정에 지정된 것)를 그대로 쓰고 앞에 원래 버킷명을 폴더처럼 붙여 구분한다.
function objectKey(bucket: string, path: string): string {
  return `${bucket}/${path}`;
}

// 브라우저에서 SigV4로 직접 서명해 S3 호환 저장소에 PUT 업로드한다. 설정이 꺼져 있거나
// 미완성이면 null을 반환해 호출부가 Supabase Storage로 폴백하게 한다.
export async function uploadToExternalStorage(bucket: string, path: string, file: Blob, contentType: string): Promise<string | null> {
  const settings = await getActiveSettings();
  if (!settings) return null;
  const { AwsClient } = await import('aws4fetch');
  const client = new AwsClient({
    accessKeyId: settings.access_key_id!,
    secretAccessKey: settings.secret_access_key!,
    region: settings.region || 'us-east-1',
    service: 's3',
  });
  const url = objectUrl(settings, objectKey(bucket, path));
  const res = await client.fetch(url, { method: 'PUT', body: file, headers: { 'Content-Type': contentType || 'application/octet-stream' } });
  if (!res.ok) throw new Error(`외부 저장소 업로드 실패 (${res.status})`);
  return url;
}

export async function isExternalStorageActive(): Promise<boolean> {
  return !!(await getActiveSettings());
}
