export interface FileStorageSettings {
  id: string;
  provider: string;
  endpoint_url: string | null;
  region: string | null;
  bucket: string | null;
  access_key_id: string | null;
  secret_access_key: string | null;
  path_style_access: boolean;
  is_active: boolean;
  memo: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}
