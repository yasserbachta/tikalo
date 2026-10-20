"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { ImagePlus, Loader2, X } from "lucide-react";

const MAX_SIZE = 2 * 1024 * 1024;
const ACCEPTED = "image/png,image/jpeg,image/jpg,image/svg+xml,image/webp";

interface LogoUploadProps {
  value: string | null;
  onChange: (logoPath: string | null) => void;
  cdnHost?: string;
  fallbackColor?: string;
  initials?: string;
  /** Where to POST the file. Defaults to the super-admin endpoint. */
  uploadEndpoint?: string;
}

export function LogoUpload({
  value,
  onChange,
  cdnHost,
  fallbackColor = "#1a2d5a",
  initials = "AG",
  uploadEndpoint = "/api/admin/agencies/upload-logo",
}: LogoUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [previewBlob, setPreviewBlob] = useState<string | null>(null);

  const url = previewBlob
    ? previewBlob
    : value && cdnHost
    ? `https://${cdnHost}/${value}`
    : null;

  const handleFile = async (file: File) => {
    if (file.size > MAX_SIZE) {
      toast.error("Logo must be under 2MB");
      return;
    }
    const localPreview = URL.createObjectURL(file);
    setPreviewBlob(localPreview);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(uploadEndpoint, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Upload failed");
      }
      const data = (await res.json()) as { logoPath: string };
      onChange(data.logoPath);
      toast.success("Logo uploaded");
    } catch (err) {
      setPreviewBlob(null);
      URL.revokeObjectURL(localPreview);
      const message = err instanceof Error ? err.message : "Upload failed";
      toast.error(message);
    } finally {
      setUploading(false);
    }
  };

  const clear = () => {
    if (previewBlob) URL.revokeObjectURL(previewBlob);
    setPreviewBlob(null);
    onChange(null);
  };

  return (
    <div className="flex items-center gap-4">
      <label className="relative cursor-pointer group/logo">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
        <span
          className="size-20 rounded-2xl ring-1 ring-inset ring-foreground/10 grid place-items-center overflow-hidden bg-card transition-all group-hover/logo:ring-foreground/20"
          style={
            url
              ? undefined
              : {
                  background: `${fallbackColor}1a`,
                  color: fallbackColor,
                }
          }
        >
          {url ? (
            <Image
              src={url}
              alt="Agency logo"
              width={80}
              height={80}
              className="size-full object-cover"
              unoptimized
            />
          ) : (
            <span className="font-display text-lg">{initials || "AG"}</span>
          )}
        </span>
        {uploading && (
          <span className="absolute inset-0 grid place-items-center bg-foreground/40 rounded-2xl">
            <Loader2 className="size-5 text-background animate-spin" />
          </span>
        )}
      </label>

      <div className="flex-1 min-w-0">
        <p className="eyebrow mb-1">Agency logo</p>
        <p className="text-[13px] text-muted-foreground leading-relaxed mb-2">
          PNG, JPG, SVG or WEBP — under 2MB. Shown in the sidebar and on
          exported PDFs.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="h-8 px-3 rounded-lg border border-border bg-card hover:bg-muted/60 transition-colors text-[12px] font-medium inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <ImagePlus className="size-3.5 text-muted-foreground" />
            {value || previewBlob ? "Replace" : "Upload"}
          </button>
          {(value || previewBlob) && (
            <button
              type="button"
              onClick={clear}
              disabled={uploading}
              className="h-8 px-3 rounded-lg text-muted-foreground hover:text-destructive text-[12px] font-medium inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <X className="size-3.5" />
              Remove
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
