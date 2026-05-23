"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { apiRequest } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { StepHint } from "@/components/ui/step-hint";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type UploadResult =
  | { kind: "idle" }
  | { kind: "uploading"; progress: number }
  | { kind: "analyzing" }
  | { kind: "done"; datasetId: string };

const allowedExtensions = new Set(["csv", "json", "xls", "xlsx"]);

function getFileExtension(name: string) {
  const parts = name.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

function uploadToSignedUrl(opts: {
  signedUrl: string;
  file: File;
  onProgress: (percent: number) => void;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", opts.signedUrl, true);
    xhr.setRequestHeader("Content-Type", opts.file.type || "application/octet-stream");

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const percent = Math.round((event.loaded / event.total) * 100);
      opts.onProgress(Math.min(100, Math.max(0, percent)));
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(xhr.responseText || `Upload failed (${xhr.status})`));
    };

    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(opts.file);
  });
}

export function DatasetUploadCard() {
  const [result, setResult] = useState<UploadResult>({ kind: "idle" });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const maxMb = useMemo(() => {
    const v = Number(process.env.NEXT_PUBLIC_DATASET_MAX_MB ?? 50);
    return Number.isFinite(v) ? v : 50;
  }, []);
  const maxBytes = maxMb * 1024 * 1024;

  async function startUploadAndAnalyze(file: File) {
    const ext = getFileExtension(file.name);
    if (!allowedExtensions.has(ext)) {
      toast.error("Unsupported file type. Use CSV, JSON, or Excel (XLS/XLSX).");
      return;
    }
    if (file.size > maxBytes) {
      toast.error(`File too large (${formatBytes(file.size)}). Max for this plan is ${maxMb}MB.`);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    const { data, error: userErr } = await supabase.auth.getUser();
    const user = data.user;

    if (userErr) {
      toast.error(userErr.message);
      return;
    }
    if (!user) {
      toast.error("Not authenticated");
      return;
    }

    try {
      setResult({ kind: "uploading", progress: 0 });

      const datasetId = crypto.randomUUID();
      const storagePath = `${user.id}/datasets/${datasetId}/${file.name}`;

      // 1) Create dataset record server-side (for later analysis + RLS isolation).
      await apiRequest("/datasets", {
        method: "POST",
        body: {
          dataset_id: datasetId,
          storage_path: storagePath,
          original_file_name: file.name,
          original_extension: ext,
          mime_type: file.type,
        },
      });

      // 2) Upload to private storage with progress via signed upload URL.
      const { data: signedData, error: signedErr } = await supabase.storage
        .from("datasets")
        .createSignedUploadUrl(storagePath, { upsert: false });

      if (signedErr || !signedData) throw signedErr ?? new Error("Failed to create upload URL");

      await uploadToSignedUrl({
        signedUrl: signedData.signedUrl,
        file,
        onProgress: (p) => setResult({ kind: "uploading", progress: p }),
      });

      // 3) Trigger instant analyzer synchronously (backend will read from storage).
      setResult({ kind: "analyzing" });
      await apiRequest(`/datasets/${datasetId}/analyze`, { method: "POST", body: { mode: "instant" } });

      toast.success("Dataset saved successfully!");
      window.dispatchEvent(new CustomEvent("datasetUploaded"));

      // Instantly reset uploader state so the div disappears
      setSelectedFile(null);
      setResult({ kind: "idle" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Upload/analyze failed";
      toast.error(message);
      setResult({ kind: "idle" });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload a dataset</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">

        <div
          className="border-2 border-dashed border-primary/20 hover:border-primary/50 bg-primary/5 hover:bg-primary/10 transition-colors rounded-xl p-8 text-center cursor-pointer flex flex-col items-center justify-center gap-4 group"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) setSelectedFile(f);
          }}
          onClick={() => document.getElementById("file-upload")?.click()}
        >
          <div className="rounded-full bg-primary/10 p-4 transition-transform group-hover:scale-105">
            <svg
              className="w-8 h-8 text-primary"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
          </div>
          <div>
            <p className="text-base font-medium text-foreground">Click to choose a file or drag & drop</p>
            <p className="text-sm text-foreground/60 mt-1">
              Supports CSV, JSON, XLS or XLSX up to {maxMb}MB
            </p>
          </div>

          <Input
            id="file-upload"
            type="file"
            className="hidden"
            accept=".csv,.json,.xls,.xlsx"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setSelectedFile(f);
            }}
          />
        </div>

        {selectedFile ? (
          <div className="flex flex-col gap-3 mt-4 border border-border p-4 rounded-lg">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                <p className="text-xs text-foreground/70">{formatBytes(selectedFile.size)}</p>
              </div>
              {result.kind === "idle" ? (
                <Button onClick={() => startUploadAndAnalyze(selectedFile)}>Save</Button>
              ) : null}
            </div>

            {result.kind === "uploading" ? (
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-foreground transition-[width]" style={{ width: `${result.progress}%` }} />
                </div>
                <p className="text-sm font-medium">{result.progress}%</p>
              </div>
            ) : null}




          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

