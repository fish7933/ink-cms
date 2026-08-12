import { supabase } from '@/lib/supabase';

export interface StoredFileEntry {
  bucket: string;
  path: string;
  name: string;
  size: number;
  updatedAt: string;
}

const BUCKETS = ['documents', 'crew-documents', 'company-assets'];
const PAGE_SIZE = 1000;

// list()는 한 단계 하위 항목만 주므로(파일 or 폴더), 폴더(id === null)를 만나면 그 안으로
// 재귀해서 실제 파일까지 전부 찾는다 — 경로 구조를 미리 알 필요 없이 버킷 전체를 훑는다.
async function listRecursive(bucket: string, path: string, out: StoredFileEntry[]): Promise<void> {
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase.storage.from(bucket).list(path, { limit: PAGE_SIZE, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error || !data) break;
    for (const entry of data) {
      const fullPath = path ? `${path}/${entry.name}` : entry.name;
      if (entry.id === null) {
        await listRecursive(bucket, fullPath, out);
      } else {
        out.push({
          bucket,
          path: fullPath,
          name: entry.name,
          size: Number(entry.metadata?.size ?? 0),
          updatedAt: entry.updated_at || entry.created_at || '',
        });
      }
    }
    if (data.length < PAGE_SIZE) break;
  }
}

export async function listAllStoredFiles(): Promise<StoredFileEntry[]> {
  const out: StoredFileEntry[] = [];
  for (const bucket of BUCKETS) await listRecursive(bucket, '', out);
  return out.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

export async function deleteStoredFiles(entries: { bucket: string; path: string }[]): Promise<void> {
  const byBucket = new Map<string, string[]>();
  for (const e of entries) {
    if (!byBucket.has(e.bucket)) byBucket.set(e.bucket, []);
    byBucket.get(e.bucket)!.push(e.path);
  }
  for (const [bucket, paths] of byBucket) {
    const { error } = await supabase.storage.from(bucket).remove(paths);
    if (error) throw error;
  }
}
