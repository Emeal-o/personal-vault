"use client";

import { useState, useEffect, useCallback } from "react";

interface VaultFile {
  key: string;
  size: number;
  lastModified: string;
  downloadUrl: string;
}

export default function Dashboard() {
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/files");
      if (res.status === 401) {
        window.location.href = "/";
        return;
      }
      const data = await res.json();
      setFiles(data.files || []);
    } catch {
      setError("Failed to load files.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError("");

    try {
      // 1. Ask our server for a presigned upload URL
      const urlRes = await fetch("/api/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name }),
      });

      if (!urlRes.ok) throw new Error("Failed to get upload URL.");
      const { uploadUrl } = await urlRes.json();

      // 2. Upload the file directly to R2 using that URL
      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
      });

      if (!putRes.ok) throw new Error("Upload to storage failed.");

      // 3. Refresh the file list
      await fetchFiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleDelete(key: string) {
    if (!confirm("Delete this file permanently?")) return;

    try {
      const res = await fetch(`/api/files/${encodeURIComponent(key)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed.");
      setFiles((prev) => prev.filter((f) => f.key !== key));
    } catch {
      setError("Failed to delete file.");
    }
  }

  function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "radial-gradient(circle at 50% 0%, #1a1a2e 0%, #0a0a0f 60%)",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        padding: "1.5rem",
        color: "#fff",
      }}
    >
      <div style={{ maxWidth: "600px", margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "2rem",
          }}
        >
          <h1 style={{ fontSize: "1.35rem", fontWeight: 600, margin: 0 }}>
            🔒 Vault
          </h1>
          <label
            style={{
              padding: "0.6rem 1.1rem",
              borderRadius: "10px",
              background: uploading ? "rgba(255,255,255,0.1)" : "#fff",
              color: uploading ? "rgba(255,255,255,0.4)" : "#000",
              fontWeight: 600,
              fontSize: "0.875rem",
              cursor: uploading ? "not-allowed" : "pointer",
            }}
          >
            {uploading ? "Uploading..." : "+ Upload"}
            <input
              type="file"
              onChange={handleUpload}
              disabled={uploading}
              style={{ display: "none" }}
            />
          </label>
        </div>

        {error && (
          <p style={{ color: "#ff6b6b", marginBottom: "1rem" }}>{error}</p>
        )}

        {loading ? (
          <p style={{ color: "rgba(255,255,255,0.4)" }}>Loading...</p>
        ) : files.length === 0 ? (
          <p style={{ color: "rgba(255,255,255,0.4)" }}>
            Nothing here yet. Upload your first file.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {files.map((file) => (
              <div
                key={file.key}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "1rem",
                  borderRadius: "12px",
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <div style={{ overflow: "hidden" }}>
                  <p
                    style={{
                      margin: 0,
                      fontSize: "0.9rem",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {file.key}
                  </p>
                  <p
                    style={{
                      margin: 0,
                      fontSize: "0.75rem",
                      color: "rgba(255,255,255,0.4)",
                    }}
                  >
                    {formatSize(file.size)}
                  </p>
                </div>
                <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
                  <a
                    href={file.downloadUrl}
                    style={{
                      padding: "0.5rem 0.75rem",
                      borderRadius: "8px",
                      background: "rgba(255,255,255,0.08)",
                      color: "#fff",
                      fontSize: "0.8rem",
                      textDecoration: "none",
                    }}
                  >
                    Download
                  </a>
                  <button
                    onClick={() => handleDelete(file.key)}
                    style={{
                      padding: "0.5rem 0.75rem",
                      borderRadius: "8px",
                      background: "rgba(255,107,107,0.15)",
                      color: "#ff6b6b",
                      border: "none",
                      fontSize: "0.8rem",
                      cursor: "pointer",
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}