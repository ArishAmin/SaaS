"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { apiRequest } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type UploadResult =
  | { kind: "idle" }
  | { kind: "uploading"; fileId: string; progress: number };

type PendingFile = {
  id: string;
  file: File;
};

type BillingAccount = {
  plan_limits?: {
    max_dataset_size_mb?: number;
    max_concurrent_datasets?: number | null;
  };
  dataset_usage?: {
    active_count?: number;
    max_concurrent_datasets?: number | null;
    can_upload_more?: boolean;
  };
};

const allowedExtensions = new Set(["csv", "json", "xls", "xlsx", "parquet"]);

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
  const [selectedFiles, setSelectedFiles] = useState<PendingFile[]>([]);
  const replacingFileIdRef = useRef<string | null>(null);
  const [planMaxMb, setPlanMaxMb] = useState<number | null>(null);
  const [datasetUsage, setDatasetUsage] = useState<BillingAccount["dataset_usage"] | null>(null);
  const [checkingLimits, setCheckingLimits] = useState(false);

  const fallbackMaxMb = useMemo(() => {
    const v = Number(process.env.NEXT_PUBLIC_DATASET_MAX_MB ?? 10);
    return Number.isFinite(v) ? v : 10;
  }, []);
  const maxMb = planMaxMb ?? fallbackMaxMb;
  const maxBytes = maxMb * 1024 * 1024;

  async function refreshAccount(mounted = true) {
    return apiRequest<BillingAccount>("/billing/account")
      .then((account) => {
        const limit = account.plan_limits?.max_dataset_size_mb;
        if (mounted && typeof limit === "number" && Number.isFinite(limit)) {
          setPlanMaxMb(limit);
        }
        if (mounted) {
          setDatasetUsage(account.dataset_usage ?? null);
        }
        return account;
      })
      .catch(() => {
        if (mounted) {
          setPlanMaxMb(null);
          setDatasetUsage(null);
        }
        return null;
      });
  }

  useEffect(() => {
    let mounted = true;
    refreshAccount(mounted);
    const handleDatasetChange = () => {
      refreshAccount(mounted);
    };
    window.addEventListener("datasetDeleted", handleDatasetChange);
    window.addEventListener("datasetUploaded", handleDatasetChange);
    return () => {
      mounted = false;
      window.removeEventListener("datasetDeleted", handleDatasetChange);
      window.removeEventListener("datasetUploaded", handleDatasetChange);
    };
  }, []);

  function validateDatasetSlot(usage = datasetUsage): boolean {
    if (usage?.can_upload_more === false) {
      const max = usage.max_concurrent_datasets ?? usage.active_count;
      toast.error(`Your plan allows up to ${max} active datasets. Delete one or upgrade for higher limits.`);
      setSelectedFiles([]);
      return false;
    }
    return true;
  }

  function validateFile(file: File): boolean {
    if (!validateDatasetSlot()) return false;
    if (planMaxMb === null) {
      toast.error("Checking your plan upload limit. Please try again in a moment.");
      return false;
    }
    const ext = getFileExtension(file.name);
    if (!allowedExtensions.has(ext)) {
      toast.error("Unsupported file type. Use CSV, JSON, Excel (XLS/XLSX), or Parquet.");
      return false;
    }
    if (file.size > maxBytes) {
      toast.error(`File too large (${formatBytes(file.size)}). Max for this plan is ${maxMb}MB.`);
      return false;
    }
    return true;
  }

  function newPendingFile(file: File): PendingFile {
    return {
      id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
      file,
    };
  }

  function chooseFile(file: File) {
    if (!validateFile(file)) return;

    setSelectedFiles((prev) => {
      const replacingFileId = replacingFileIdRef.current;
      if (replacingFileId) {
        const replacement = newPendingFile(file);
        return prev.map((pending) => (pending.id === replacingFileId ? replacement : pending));
      }
      return [...prev, newPendingFile(file)];
    });
    replacingFileIdRef.current = null;
  }

  function clearSelectedFile(fileId: string) {
    if (result.kind !== "idle") return;
    setSelectedFiles((prev) => prev.filter((pending) => pending.id !== fileId));
  }

  async function openFilePicker(replaceFileId?: string) {
    if (checkingLimits || result.kind !== "idle") return;
    replacingFileIdRef.current = replaceFileId ?? null;

    // Use cached usage data to avoid blocking the file dialog on a network call.
    // Only fetch fresh data if we have no cached usage at all.
    if (datasetUsage) {
      if (!validateDatasetSlot(datasetUsage)) {
        replacingFileIdRef.current = null;
        return;
      }
      document.getElementById("file-upload")?.click();
      // Refresh in background for next time
      refreshAccount();
    } else {
      setCheckingLimits(true);
      try {
        const account = await refreshAccount();
        if (!validateDatasetSlot(account?.dataset_usage ?? null)) {
          replacingFileIdRef.current = null;
          return;
        }
        document.getElementById("file-upload")?.click();
      } finally {
        setCheckingLimits(false);
      }
    }
  }

  async function startUpload(pendingFile: PendingFile) {
    if (result.kind !== "idle") return;
    
    const { file } = pendingFile;
    if (!validateFile(file)) return;
    
    // Set uploading state synchronously to prevent double-clicks during the async getUser call
    setResult({ kind: "uploading", fileId: pendingFile.id, progress: 0 });
    
    const ext = getFileExtension(file.name);

    const supabase = getSupabaseBrowserClient();
    const { data, error: userErr } = await supabase.auth.getUser();
    const user = data.user;

    if (userErr) {
      setResult({ kind: "idle" });
      toast.error(userErr.message);
      return;
    }
    if (!user) {
      setResult({ kind: "idle" });
      toast.error("Not authenticated");
      return;
    }

    let datasetId: string | null = null;

    try {

      datasetId = crypto.randomUUID();
      const storagePath = `${user.id}/datasets/${datasetId}/${file.name}`;

      // 1) Create dataset record server-side (for later analysis + RLS isolation).
      await apiRequest("/datasets", {
        method: "POST",
        body: {
          dataset_id: datasetId,
          storage_path: storagePath,
          original_file_name: file.name,
          original_extension: ext,
          file_size_bytes: file.size,
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
        onProgress: (p) => setResult({ kind: "uploading", fileId: pendingFile.id, progress: p }),
      });

      toast.success("Dataset saved. Choose Analyze, Clean, or Train when you're ready.");
      window.dispatchEvent(new CustomEvent("datasetUploaded"));
      refreshAccount();

      setSelectedFiles((prev) => prev.filter((pending) => pending.id !== pendingFile.id));
      setResult({ kind: "idle" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Upload failed";
      toast.error(message);
      if (datasetId) {
        apiRequest(`/datasets/${datasetId}`, { method: "DELETE" }).catch(() => undefined);
      }
      setSelectedFiles((prev) => prev.filter((pending) => pending.id !== pendingFile.id));
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
            if (!validateDatasetSlot()) return;
            const files = e.dataTransfer.files;
            const file = files?.[0];
            if (file) chooseFile(file);
          }}
          onClick={() => openFilePicker()}
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
              Supports CSV, JSON, XLS, XLSX, or Parquet up to {planMaxMb === null ? "your plan limit" : `${maxMb}MB`}
            </p>
          </div>

          <Input
            id="file-upload"
            type="file"
            className="hidden"
            accept=".csv,.json,.xls,.xlsx,.parquet"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) chooseFile(file);
              e.currentTarget.value = "";
            }}
          />
        </div>

        {selectedFiles.length ? (
          <div className="flex flex-col gap-3 mt-4 border border-border p-4 rounded-lg">
            {selectedFiles.map((pendingFile) => (
              <div key={pendingFile.id} className="border-b border-border/70 pb-3 last:border-b-0 last:pb-0">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{pendingFile.file.name}</p>
                    <p className="text-xs text-foreground/70">{formatBytes(pendingFile.file.size)}</p>
                  </div>
                  {result.kind === "idle" ? (
                    <div className="flex items-center gap-2">
                      <Button variant="outline" onClick={() => openFilePicker(pendingFile.id)}>
                        Update
                      </Button>
                      <Button onClick={() => startUpload(pendingFile)}>Save</Button>
                      <Button
                        variant="destructive"
                        size="icon"
                        aria-label={`Clear ${pendingFile.file.name}`}
                        onClick={() => clearSelectedFile(pendingFile.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : null}
                </div>

                {result.kind === "uploading" && result.fileId === pendingFile.id ? (
                  <div className="flex items-center gap-3 mt-3">
                    <div className="flex-1 h-2 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-foreground transition-[width]" style={{ width: `${result.progress}%` }} />
                    </div>
                    <p className="text-sm font-medium">{result.progress}%</p>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
