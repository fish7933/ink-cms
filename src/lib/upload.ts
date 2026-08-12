import { supabase } from '@/lib/supabase';
import { uploadToExternalStorage } from '@/lib/s3-client';

const IMAGE_TYPE_RE = /^image\/(jpeg|png|webp|gif|bmp)$/i;

// 압축 라이브러리는 실제로 첨부파일을 올릴 때만 필요하므로 동적 import로 불러온다 —
// 그룹웨어/경리 페이지 대부분이 즉시 로드되는 번들이라 정적 import로 두면 pdf-lib/
// browser-image-compression이 전부 초기 번들에 포함돼 버림.

// 그룹웨어/경리 첨부파일 업로드 시 자동으로 용량을 줄인다. 선원관리 쪽 업로드는 이 함수를
// 쓰지 않고 기존처럼 원본을 그대로 올린다(증서/사진 등은 화질 저하가 실무에 영향을 줄 수 있음).
export async function compressImageFile(file: File): Promise<File> {
  try {
    const { default: imageCompression } = await import('browser-image-compression');
    return await imageCompression(file, { maxSizeMB: 1.5, maxWidthOrHeight: 2000, useWebWorker: true, initialQuality: 0.82 });
  } catch (e) {
    console.error('이미지 압축 실패, 원본으로 진행:', e);
    return file;
  }
}

// pdf-lib는 이미지 재인코딩까지는 하지 못하고 오브젝트 스트림 재정렬 정도의 구조적 압축만
// 가능하다 — 스캔본처럼 이미지가 큰 PDF는 감소폭이 크지 않을 수 있다.
export async function compressPdfFile(file: File): Promise<File> {
  try {
    const { PDFDocument } = await import('pdf-lib');
    const bytes = await file.arrayBuffer();
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const compressed = await doc.save({ useObjectStreams: true });
    if (compressed.byteLength >= bytes.byteLength) return file;
    return new File([compressed as BlobPart], file.name, { type: 'application/pdf', lastModified: file.lastModified });
  } catch (e) {
    console.error('PDF 압축 실패, 원본으로 진행:', e);
    return file;
  }
}

async function compressForUpload(file: File): Promise<File> {
  if (IMAGE_TYPE_RE.test(file.type)) return compressImageFile(file);
  if (file.type === 'application/pdf') return compressPdfFile(file);
  return file;
}

export interface UploadedFileMeta {
  name: string;
  path: string;
  size: number;
  type: string;
}

// 그룹웨어/경리 첨부파일 전용 업로드 — 이미지/PDF는 자동 압축 후 올린다. 파일 저장소 설정에서
// 외부 S3 호환 저장소를 켜뒀으면 그쪽으로, 아니면 이 시스템(Supabase Storage)으로 올라간다.
// 외부로 올라간 파일은 path에 완전한 URL을 그대로 저장해두므로(상대경로가 아니라) 나중에
// getFileUrl()이 백엔드를 몰라도 그대로 열 수 있다 — 저장소 설정이 나중에 바뀌어도 이미
// 올라간 파일의 링크는 안 깨진다.
export async function uploadCompressed(bucket: string, pathPrefix: string, file: File): Promise<UploadedFileMeta> {
  const toUpload = await compressForUpload(file);
  const ext = file.name.split('.').pop();
  const relativePath = `${pathPrefix}${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;

  const externalUrl = await uploadToExternalStorage(bucket, relativePath, toUpload, toUpload.type || file.type).catch(e => {
    console.error('외부 저장소 업로드 실패, Supabase Storage로 대체합니다:', e);
    return null;
  });
  if (externalUrl) {
    return { name: file.name, path: externalUrl, size: toUpload.size, type: toUpload.type || file.type };
  }

  const { error } = await supabase.storage.from(bucket).upload(relativePath, toUpload);
  if (error) throw error;
  return { name: file.name, path: relativePath, size: toUpload.size, type: toUpload.type || file.type };
}

// 첨부파일의 저장 위치(path)가 이미 완전한 URL(외부 저장소로 올라간 파일)이면 그대로,
// 상대경로(Supabase Storage에 올라간 기존/현재 파일)면 getPublicUrl로 변환한다.
export function getFileUrl(bucket: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
