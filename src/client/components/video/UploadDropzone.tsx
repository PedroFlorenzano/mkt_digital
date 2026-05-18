"use client";

import { useRef, useState, useCallback } from "react";
import { Upload, Video, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@client/components/ui/button";

const MAX_SIZE_MB = 500;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;
const VALID_MIME_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm", "video/mov"]);
// Also accept by extension as fallback (some OS report wrong MIME)
const VALID_EXTENSIONS = new Set(["mp4", "mov", "webm"]);

function isValidVideo(file: File): boolean {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return VALID_MIME_TYPES.has(file.type) || VALID_EXTENSIONS.has(ext);
}

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
  const [fileName, setFileName] = useState<string>("");

  const resetInput = useCallback(() => {
    // Reset the input value so the same file can be selected again
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }, []);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setProgress(0);
    setDone(false);
    setFileName(file.name);

    // Validate format
    if (!isValidVideo(file)) {
      setError("Formato inválido. Use MP4, MOV ou WebM.");
      return;
    }

    // Validate size
    if (file.size > MAX_SIZE_BYTES) {
      setError(`Arquivo muito grande. Máximo ${MAX_SIZE_MB} MB.`);
      return;
    }

    setUploading(true);
    setProgress(5);

    try {
      // Use multipart upload to our own API (no S3 presigned URL needed in dev)
      const formData = new FormData();
      formData.append("file", file);

      // Track progress with XHR
      const s3Key = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/video/upload-local");

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            // Scale from 5% to 90% during upload
            const pct = 5 + Math.round((e.loaded / e.total) * 85);
            setProgress(pct);
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const data = JSON.parse(xhr.responseText) as { s3Key?: string; error?: string };
              if (data.s3Key) {
                resolve(data.s3Key);
              } else {
                reject(new Error(data.error ?? "Resposta inválida do servidor."));
              }
            } catch {
              reject(new Error("Resposta inválida do servidor."));
            }
          } else {
            let msg = `Erro ${xhr.status}`;
            try {
              const data = JSON.parse(xhr.responseText) as { error?: string };
              if (data.error) msg = data.error;
            } catch { /* ignore */ }
            reject(new Error(msg));
          }
        };

        xhr.onerror = () => reject(new Error("Erro de rede. Verifique sua conexão e tente novamente."));
        xhr.ontimeout = () => reject(new Error("Tempo esgotado. O arquivo pode ser muito grande."));
        xhr.timeout = 5 * 60 * 1000; // 5 minutes max

        xhr.send(formData);
      });

      setProgress(100);
      setDone(true);
      onUploaded(s3Key);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha no upload. Tente novamente.";
      setError(message);
      resetInput();
    } finally {
      setUploading(false);
    }
  }, [onUploaded, resetInput]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  }, [handleFile]);

  const onChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    // Reset so the same file can be re-selected
    e.target.value = "";
  }, [handleFile]);

  const handleSelectClick = useCallback(() => {
    resetInput();
    inputRef.current?.click();
  }, [resetInput]);

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 rounded-xl border-2 border-green-200 bg-green-50">
        <CheckCircle2 className="h-12 w-12 text-green-500" />
        <p className="text-green-700 font-medium">Upload concluído com sucesso</p>
        <p className="text-green-600 text-sm truncate max-w-xs">{fileName}</p>
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={`relative flex flex-col items-center gap-4 py-12 px-6 rounded-xl border-2 border-dashed transition-colors ${
        dragging
          ? "border-blue-400 bg-blue-50"
          : uploading
          ? "border-blue-200 bg-blue-50/30"
          : "border-gray-200 bg-gray-50 hover:border-gray-300"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
        className="hidden"
        onChange={onChange}
      />

      {uploading ? (
        <>
          <Video className="h-12 w-12 text-blue-400 animate-pulse" />
          <p className="text-sm text-gray-700 font-medium">
            {fileName ? `Enviando ${fileName}...` : "Enviando vídeo..."} {progress}%
          </p>
          <div className="w-full max-w-xs bg-gray-200 rounded-full h-2.5">
            <div
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-gray-400">Isso pode levar alguns momentos para arquivos grandes</p>
        </>
      ) : (
        <>
          <Upload className="h-12 w-12 text-gray-400" />
          <div className="text-center">
            <p className="text-sm font-medium text-gray-700">Arraste um vídeo ou clique para selecionar</p>
            <p className="text-xs text-gray-400 mt-1">MP4, MOV ou WebM · Máximo {MAX_SIZE_MB} MB</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleSelectClick}>
            Selecionar arquivo
          </Button>
        </>
      )}

      {error && !uploading && (
        <div className="flex flex-col items-center gap-2 text-sm text-red-600 text-center">
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="border-red-200 text-red-600 hover:bg-red-50"
            onClick={handleSelectClick}
          >
            Tentar novamente
          </Button>
        </div>
      )}
    </div>
  );
}
