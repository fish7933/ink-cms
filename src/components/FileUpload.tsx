import { useState } from 'react';
import { Upload, X, FileText, Download, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { uploadFile, listFiles, deleteFile } from '@/lib/storage';

interface FileUploadProps {
  bucket: 'crew-documents' | 'ship-documents';
  entityId: string;
  entityType: 'crew' | 'ship';
  onUploadComplete?: () => void;
}

interface UploadedFile {
  name: string;
  url: string;
  size: number;
  created_at: string;
}

export default function FileUpload({ bucket, entityId, entityType, onUploadComplete }: FileUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [loading, setLoading] = useState(false);

  // Load existing files
  const loadFiles = async () => {
    setLoading(true);
    const existingFiles = await listFiles(bucket, entityId);
    setFiles(existingFiles);
    setLoading(false);
  };

  // Load files on mount
  useState(() => {
    loadFiles();
  });

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    setUploading(true);

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        const timestamp = Date.now();
        const filePath = `${entityId}/${timestamp}_${file.name}`;
        
        await uploadFile(bucket, filePath, file);
      }

      // Reload files after upload
      await loadFiles();
      
      if (onUploadComplete) {
        onUploadComplete();
      }
    } catch (error) {
      console.error('Error uploading files:', error);
    } finally {
      setUploading(false);
      // Reset input
      event.target.value = '';
    }
  };

  const handleDelete = async (fileName: string) => {
    if (!confirm('Are you sure you want to delete this file?')) return;

    const filePath = `${entityId}/${fileName}`;
    const success = await deleteFile(bucket, filePath);
    
    if (success) {
      await loadFiles();
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">
            {entityType === 'crew' ? 'Crew Documents' : 'Ship Documents'}
          </h3>
          <label htmlFor={`file-upload-${entityId}`}>
            <Button
              variant="outline"
              size="sm"
              disabled={uploading}
              asChild
            >
              <span className="cursor-pointer">
                <Upload className="w-4 h-4 mr-2" />
                {uploading ? 'Uploading...' : 'Upload Files'}
              </span>
            </Button>
            <input
              id={`file-upload-${entityId}`}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
        </div>

        {loading ? (
          <div className="text-center py-8 text-gray-500">Loading files...</div>
        ) : files.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No documents uploaded yet
          </div>
        ) : (
          <div className="space-y-2">
            {files.map((file) => (
              <div
                key={file.name}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center space-x-3 flex-1 min-w-0">
                  <FileText className="w-5 h-5 text-blue-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-gray-500">
                      {formatFileSize(file.size)} • {new Date(file.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2 ml-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.open(file.url, '_blank')}
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(file.name)}
                  >
                    <Trash2 className="w-4 h-4 text-red-600" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-gray-500 mt-4">
          Accepted formats: PDF, DOC, DOCX, JPG, PNG (Max 50MB per file)
        </p>
      </div>
    </Card>
  );
}