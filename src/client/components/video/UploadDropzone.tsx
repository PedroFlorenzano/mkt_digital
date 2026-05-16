"use client";

import { useRef, useState, useCallback } from "react";
import { Upload, Video, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@client/components/ui/button";
import { isValidVideoFormat } from "@server/lib/video-validations";

const MAX_SIZE_MB = 500;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

interface UploadDropzoneProps {
  onUploaded: (s3Key: string) => void;
}

export function UploadDropzone({ onUploaded }: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setProgress(0);
    setDone(false);

    // Validate format
    if (!isValidVideoFormat(file.type)) {
      setError("Formato inválido. Use MP4, MOV ou WebM.");
      return;
    }

    // Validate size
    if (file.size > MAX_SIZE_BYTES) {
      setError(`Arquivo muito grande. Máximo ${MAX_SIZE_MB} MB.`);
      return;
    }

    setUploading(true);

    try {
      // Get presigned URL
      const presignRes = await fetch("/api/video/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, fileSize: file.size, mimeType: file.type }),
      });

      if (!presignRes.ok) {
        const err = await presignRes.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Falha ao obter URL de upload.");
      }

      const { uploadUrl, s3Key } = await presignRes.json() as { uploadUrl: string; s3Key: string };

      // Upload directly to S3 via XHR for progress tracking
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadUrl);
        xhr.setRequestHeader("Content-Type", file.type);

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setProgress(Math.round((e.loaded / e.total) * 100));
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Upload failed: ${xhr.statusText}`));
          }
        };
        xhr.onerror = () => reject(new Error("Erro de rede durante upload."));
        xhr.send(file);
      });

      setProgress(100);
      setDone(true);
      onUploaded(s3Key);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no upload. Tente novamente.");
    } finally {
      setUploading(false);
    }
  }, [onUploaded]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  }, [handleFile]);

  const onChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  }, [handleFile]);

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 rounded-xl border-2 border-green-200 bg-green-50">
        <CheckCircle2 className="h-12 w-12 text-green-500" />
        <p className="text-green-700 font-medium">Upload concluído com sucesso</p>
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={`relative flex flex-col items-center gap-4 py-12 px-6 rounded-xl border-2 border-dashed transition-colors ${
        dragging ? "border-blue-400 bg-blue-50" : "border-gray-200 bg-gray-50 hover:border-gray-300"
      }`}
    >
      <input ref={inputRef} type="file" accept="video/mp4,video/quicktime,video/webm" className="hidden" onChange={onChange} />

      {uploading ? (
        <>
          <Video className="h-12 w-12 text-blue-400 animate-pulse" />
          <p className="text-sm text-gray-600 font-medium">Enviando vídeo... {progress}%</p>
          <div className="w-full max-w-xs bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </>
      ) : (
        <>
          <Upload className="h-12 w-12 text-gray-400" />
          <div className="text-center">
            <p className="text-sm font-medium text-gray-700">Arraste um vídeo ou clique para selecionar</p>
            <p className="text-xs text-gray-400 mt-1">MP4, MOV ou WebM · Máximo {MAX_SIZE_MB} MB</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
            Selecionar arquivo
          </Button>
        </>
      )}

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
          <Button variant="ghost" size="sm" className="ml-2" onClick={() => { setError(null); inputRef.current?.click(); }}>
            Tentar novamente
          </Button>
        </div>
      )}
    </div>
  );
}
