import { supabase } from './supabase';

/**
 * Upload a file to Supabase Storage
 * @param bucket - Storage bucket name ('crew-documents' or 'ship-documents')
 * @param path - File path within the bucket (e.g., 'crew_id/certificate.pdf')
 * @param file - File object to upload
 * @returns Public URL of the uploaded file or null on error
 */
export async function uploadFile(
  bucket: string,
  path: string,
  file: File
): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, file, {
        cacheControl: '3600',
        upsert: true, // Replace if file exists
      });

    if (error) {
      console.error('Error uploading file:', error);
      return null;
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(data.path);

    return urlData.publicUrl;
  } catch (error) {
    console.error('Exception during file upload:', error);
    return null;
  }
}

/**
 * List files in a specific path
 * @param bucket - Storage bucket name
 * @param path - Folder path to list files from
 * @returns Array of file objects
 */
export async function listFiles(
  bucket: string,
  path: string
): Promise<Array<{ name: string; url: string; size: number; created_at: string }>> {
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(path, {
        limit: 100,
        offset: 0,
        sortBy: { column: 'created_at', order: 'desc' },
      });

    if (error) {
      console.error('Error listing files:', error);
      return [];
    }

    // Get public URLs for all files
    return data.map((file) => {
      const { data: urlData } = supabase.storage
        .from(bucket)
        .getPublicUrl(`${path}/${file.name}`);

      return {
        name: file.name,
        url: urlData.publicUrl,
        size: file.metadata?.size || 0,
        created_at: file.created_at || '',
      };
    });
  } catch (error) {
    console.error('Exception during file listing:', error);
    return [];
  }
}

/**
 * Delete a file from storage
 * @param bucket - Storage bucket name
 * @param path - Full path to the file
 * @returns True if successful, false otherwise
 */
export async function deleteFile(bucket: string, path: string): Promise<boolean> {
  try {
    const { error } = await supabase.storage.from(bucket).remove([path]);

    if (error) {
      console.error('Error deleting file:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Exception during file deletion:', error);
    return false;
  }
}

/**
 * Download a file
 * @param bucket - Storage bucket name
 * @param path - Full path to the file
 * @returns Blob data or null on error
 */
export async function downloadFile(bucket: string, path: string): Promise<Blob | null> {
  try {
    const { data, error } = await supabase.storage.from(bucket).download(path);

    if (error) {
      console.error('Error downloading file:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Exception during file download:', error);
    return null;
  }
}