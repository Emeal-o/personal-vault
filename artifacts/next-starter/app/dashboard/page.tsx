"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { encryptBlob, decryptBlob, encryptText, decryptText } from "@/lib/crypto";

interface VaultFile {
  key: string;
  size: number;
  lastModified: string;
  downloadUrl: string;
  displayName?: string | null;
  isFavorite?: boolean;
}

interface FolderMeta {
  id: string;
  name: string;
  protected: boolean;
  deleteProtected?: boolean;
  deleteUsesUnlockPassphrase?: boolean;
  createdAt: string;
}

interface SecretPayload {
  kind: "note" | "login";
  title: string;
  body?: string;
  username?: string;
  password?: string;
}

interface StorageFolder {
  id: string;
  name: string;
  protected: boolean;
  bytes: number;
  count: number;
}

interface StorageProviderSummary {
  id: string;
  label: string;
  limitBytes: number;
  usedBytes: number;
  usedCount: number;
  general: { bytes: number; count: number };
  folders: StorageFolder[];
}

interface StorageSummary {
  providers: StorageProviderSummary[];
  total: { usedBytes: number; limitBytes: number };
}

interface SearchResult {
  file_key: string;
  folder_id: string | null;
  display_name: string;
  size_bytes: number;
  created_at: string;
}

const COLORS = {
  bg: "#000000",
  surface: "#161618",
  elevated: "#1E1E21",
  border: "rgba(255,255,255,0.06)",
  text: "#F5F5F5",
  muted: "#8E8E93",
  brass: "#F0A83E",
  brassBright: "#F0A83E",
  sage: "#34C759",
  danger: "#FF453A",
};

const FONT_MONO = "ui-monospace, 'SF Mono', monospace";

function KeyholeIcon({ unlocked, color }: { unlocked: boolean; color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      {unlocked ? (
        <path d="M7 10V7a5 5 0 0 1 9.5-2.2" stroke={color} strokeWidth="1.8" strokeLinecap="round" fill="none" />
      ) : (
        <path d="M7 10V7a5 5 0 0 1 10 0v3" stroke={color} strokeWidth="1.8" strokeLinecap="round" fill="none" />
      )}
      <rect x="5" y="10" width="14" height="10" rx="2" stroke={color} strokeWidth="1.8" fill="none" />
      <circle cx="12" cy="14.5" r="1.4" fill={color} />
      <path d="M12 15.8V17.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CompartmentIcon({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect x="3.5" y="6" width="17" height="14" rx="1.5" stroke={color} strokeWidth="1.6" fill="none" />
      <path d="M3.5 10.5h17" stroke={color} strokeWidth="1.4" />
      <circle cx="12" cy="15" r="1.1" fill={color} />
    </svg>
  );
}

function DocumentIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M6 3.5h9l4 4V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" stroke={color} strokeWidth="1.5" strokeLinejoin="round" fill="none" />
      <path d="M15 3.5V8h4" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function NoteIcon({ color }: { color: string }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <path d="M6 3.5h9l4 4V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" stroke={color} strokeWidth="1.5" strokeLinejoin="round" fill="none" />
      <path d="M8 11h8M8 14.5h8M8 17.5h5" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function KeyIcon({ color }: { color: string }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <circle cx="7" cy="15" r="3.4" stroke={color} strokeWidth="1.6" fill="none" />
      <path d="M9.4 12.6 18 4M15 7.5l2.2 2.2M17.6 4.9l2.2 2.2" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function VaultDialIcon({ color }: { color: string }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.7" fill="none" />
      <circle cx="12" cy="12" r="3" stroke={color} strokeWidth="1.5" fill="none" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ListIcon({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <rect x="4" y="5" width="16" height="3" rx="1" fill={color} />
      <rect x="4" y="10.5" width="16" height="3" rx="1" fill={color} />
      <rect x="4" y="16" width="16" height="3" rx="1" fill={color} />
    </svg>
  );
}

function GridIcon({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <rect x="4" y="4" width="7" height="7" rx="1.5" fill={color} />
      <rect x="13" y="4" width="7" height="7" rx="1.5" fill={color} />
      <rect x="4" y="13" width="7" height="7" rx="1.5" fill={color} />
      <rect x="13" y="13" width="7" height="7" rx="1.5" fill={color} />
    </svg>
  );
}

function GearIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="3" stroke={color} strokeWidth="1.7" />
      <path
        d="M19.4 13.5c.04-.33.06-.66.06-1s-.02-.67-.06-1l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.4 7.4 0 0 0-1.73-1l-.36-2.54a.5.5 0 0 0-.5-.43h-3.84a.5.5 0 0 0-.5.43l-.36 2.54a7.4 7.4 0 0 0-1.73 1l-2.39-.96a.5.5 0 0 0-.6.22L2.65 9.28a.5.5 0 0 0 .12.64L4.8 11.5c-.04.33-.06.66-.06 1s.02.67.06 1l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.53.43 1.11.77 1.73 1l.36 2.54a.5.5 0 0 0 .5.43h3.84a.5.5 0 0 0 .5-.43l.36-2.54a7.4 7.4 0 0 0 1.73-1l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64L19.4 13.5Z"
        stroke={color}
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CopyIcon({ color }: { color: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <rect x="9" y="9" width="12" height="12" rx="2" stroke={color} strokeWidth="1.7" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" stroke={color} strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function EyeIcon({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path
        d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z"
        stroke={color}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.6" stroke={color} strokeWidth="1.6" />
    </svg>
  );
}

function EyeOffIcon({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path
        d="M3 3l18 18M10.6 5.7A10.9 10.9 0 0 1 12 5.5c6.5 0 10 6.5 10 6.5a15.6 15.6 0 0 1-3.4 4.2M6.6 6.6C4 8.3 2 12 2 12s3.5 6.5 10 6.5c1.4 0 2.6-.3 3.7-.8"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M9.9 9.9a2.6 2.6 0 0 0 3.6 3.6" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function PencilIcon({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path
        d="M4 20l.9-3.6L16.4 5 19 7.6 7.6 19.1 4 20Z"
        stroke={color}
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path d="M14.5 6.9 17.1 9.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function TrashIcon({ color }: { color: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <path d="M4 7h16" stroke={color} strokeWidth="1.7" strokeLinecap="round" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" stroke={color} strokeWidth="1.7" />
      <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" stroke={color} strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

function DownloadIcon({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M12 3v12M7 10l5 5 5-5" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 19h16" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function SearchIcon({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <circle cx="11" cy="11" r="7" stroke={color} strokeWidth="1.8" />
      <path d="M20 20l-4-4" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M4 12l6 6L20 6" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function XIcon({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M6 6l12 12M18 6 6 18" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function StarIcon({ filled, color, small }: { filled?: boolean; color: string; small?: boolean }) {
  const size = small ? "13" : "17";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 2.5l2.9 6.1 6.6.7-4.9 4.6 1.3 6.6L12 17.6l-5.9 3.1 1.3-6.6L2.5 9.3l6.6-.7L12 2.5Z"
        stroke={color}
        strokeWidth="1.6"
        strokeLinejoin="round"
        fill={filled ? color : "none"}
      />
    </svg>
  );
}

function MoreIcon({ color, small }: { color: string; small?: boolean }) {
  const r = small ? 1.4 : 1.7;
  const size = small ? "16" : "18";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="5" r={r} fill={color} />
      <circle cx="12" cy="12" r={r} fill={color} />
      <circle cx="12" cy="19" r={r} fill={color} />
    </svg>
  );
}

function ShareIcon({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="18" cy="5" r="2.6" stroke={color} strokeWidth="1.6" />
      <circle cx="6" cy="12" r="2.6" stroke={color} strokeWidth="1.6" />
      <circle cx="18" cy="19" r="2.6" stroke={color} strokeWidth="1.6" />
      <path d="M8.3 10.7l7.4-4.4M8.3 13.3l7.4 4.4" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function isImageFile(key: string) {
  return /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i.test(key);
}

function isSecretFile(key: string) {
  return key.endsWith(".vaultsecret");
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function fileDisplayName(file: VaultFile) {
  if (file.displayName) return file.displayName;
  const parts = file.key.split("/");
  const last = parts[parts.length - 1];
  return last.replace(/^\d+-/, "");
}

const LONG_PRESS_MS = 450;
const MOVE_THRESHOLD_PX = 10;

export default function Dashboard() {
  const [view, setView] = useState<"root" | FolderMeta>("root");
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [folders, setFolders] = useState<FolderMeta[]>([]);
  const [unlockedFolders, setUnlockedFolders] = useState<Set<string>>(new Set());
  const [unlockedPassphrases, setUnlockedPassphrases] = useState<Record<string, string>>({});
  const [decryptedUrls, setDecryptedUrls] = useState<Record<string, string>>({});
  const [decryptedSecrets, setDecryptedSecrets] = useState<Record<string, SecretPayload>>({});
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());
  const decryptingRef = useRef<Set<string>>(new Set());

  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  const [sortBy, setSortBy] = useState<"name" | "date" | "size">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderProtect, setNewFolderProtect] = useState(false);
  const [newFolderPassphrase, setNewFolderPassphrase] = useState("");
  const [newFolderDeleteProtect, setNewFolderDeleteProtect] = useState(false);
  const [newFolderDeleteReuseUnlock, setNewFolderDeleteReuseUnlock] = useState(true);
  const [newFolderDeletePassphrase, setNewFolderDeletePassphrase] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderError, setNewFolderError] = useState("");

  const [unlockTarget, setUnlockTarget] = useState<FolderMeta | null>(null);
  const [unlockPassphrase, setUnlockPassphrase] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState("");

  const [deleteFolderTarget, setDeleteFolderTarget] = useState<FolderMeta | null>(null);
  const [deleteFolderPassphrase, setDeleteFolderPassphrase] = useState("");
  const [deletingFolder, setDeletingFolder] = useState(false);
  const [deleteFolderError, setDeleteFolderError] = useState("");

  const [showAddSecret, setShowAddSecret] = useState(false);
  const [secretKind, setSecretKind] = useState<"note" | "login">("login");
  const [secretTitle, setSecretTitle] = useState("");
  const [secretBody, setSecretBody] = useState("");
  const [secretUsername, setSecretUsername] = useState("");
  const [secretPassword, setSecretPassword] = useState("");
  const [savingSecret, setSavingSecret] = useState(false);
  const [secretError, setSecretError] = useState("");

  const [showPasswordGen, setShowPasswordGen] = useState(false);
  const [genLength, setGenLength] = useState(20);
  const [genUseUpper, setGenUseUpper] = useState(true);
  const [genUseLower, setGenUseLower] = useState(true);
  const [genUseNumbers, setGenUseNumbers] = useState(true);
  const [genUseSymbols, setGenUseSymbols] = useState(true);

  const [showSettings, setShowSettings] = useState(false);
  const [storage, setStorage] = useState<StorageSummary | null>(null);
  const [storageLoading, setStorageLoading] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);

  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDraggingRef = useRef(false);
  const dragToggledRef = useRef<Set<string>>(new Set());

  // Per-row "..." action sheet (Download / Favorite / Move / Copy / Delete)
  const [rowMenuFile, setRowMenuFile] = useState<VaultFile | null>(null);
  // Bulk selection toolbar overflow (Select all / Move / Copy / Favorite)
  const [showBulkOverflow, setShowBulkOverflow] = useState(false);

  const [showMoveModal, setShowMoveModal] = useState(false);
  const [transferMode, setTransferMode] = useState<"move" | "copy">("move");
  const [transferKeys, setTransferKeys] = useState<Set<string>>(new Set());
  const [moveDestPassphraseNeeded, setMoveDestPassphraseNeeded] = useState<FolderMeta | null>(null);
  const [moveDestPassphraseInput, setMoveDestPassphraseInput] = useState("");
  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState("");
  const [moveProgress, setMoveProgress] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const inFolder = view !== "root";
  const currentFolderId = inFolder ? (view as FolderMeta).id : null;
  const currentFolderProtected = inFolder && (view as FolderMeta).protected;
  const currentPassphrase = currentFolderId ? unlockedPassphrases[currentFolderId] : undefined;
  const canAddSecrets = Boolean(currentFolderProtected && currentPassphrase);

  const regularFiles = files.filter((f) => !isSecretFile(f.key));
  const secretFiles = files.filter((f) => isSecretFile(f.key));
  const favoriteFiles = regularFiles.filter((f) => f.isFavorite);

  const sortedFiles = useMemo(() => {
    const arr = [...regularFiles];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "name") {
        cmp = fileDisplayName(a).localeCompare(fileDisplayName(b), undefined, { sensitivity: "base" });
      } else if (sortBy === "date") {
        cmp = new Date(a.lastModified).getTime() - new Date(b.lastModified).getTime();
      } else {
        cmp = a.size - b.size;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, sortBy, sortDir]);

  function handleSortClick(opt: "name" | "date" | "size") {
    if (sortBy === opt) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(opt);
      setSortDir(opt === "name" ? "asc" : "desc");
    }
  }

  function generatePassword() {
    const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const lower = "abcdefghijkmnopqrstuvwxyz";
    const numbers = "23456789";
    const symbols = "!@#$%^&*()-_=+[]{}";

    let pool = "";
    if (genUseUpper) pool += upper;
    if (genUseLower) pool += lower;
    if (genUseNumbers) pool += numbers;
    if (genUseSymbols) pool += symbols;
    if (!pool) pool = lower;

    const bytes = new Uint32Array(genLength);
    window.crypto.getRandomValues(bytes);
    let result = "";
    for (let i = 0; i < genLength; i++) {
      result += pool[bytes[i] % pool.length];
    }
    setSecretPassword(result);
  }

  const fetchFolders = useCallback(async () => {
    try {
      const res = await fetch("/api/folders");
      if (res.status === 401) {
        window.location.href = "/";
        return;
      }
      const data = await res.json();
      setFolders(data.folders || []);
    } catch {
      setError("Failed to load folders.");
    }
  }, []);

  const fetchFiles = useCallback(async (folderId: string | null) => {
    setLoading(true);
    try {
      const url = folderId ? `/api/files?folderId=${folderId}` : "/api/files";
      const res = await fetch(url);
      if (res.status === 401) {
        if (!folderId) {
          window.location.href = "/";
        }
        setError("This folder is locked.");
        setFiles([]);
        return;
      }
      const data = await res.json();
      setFiles(data.files || []);
      setError("");
    } catch {
      setError("Failed to load files.");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStorage = useCallback(async () => {
    setStorageLoading(true);
    try {
      const res = await fetch("/api/storage");
      if (!res.ok) return;
      const data = await res.json();
      setStorage(data);
    } catch {
      // silently ignore; settings panel just won't show numbers
    } finally {
      setStorageLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFolders();
  }, [fetchFolders]);

  useEffect(() => {
    fetchFiles(currentFolderId);
    setSelectedKeys(new Set());
  }, [currentFolderId, fetchFiles]);

  useEffect(() => {
    setDecryptedUrls((prev) => {
      Object.values(prev).forEach((url) => URL.revokeObjectURL(url));
      return {};
    });
    setDecryptedSecrets({});
    setRevealedKeys(new Set());
    decryptingRef.current = new Set();
  }, [currentFolderId]);

  useEffect(() => {
    if (!currentFolderProtected || !currentPassphrase) return;

    files.forEach((file) => {
      if (decryptingRef.current.has(file.key)) return;
      if (isSecretFile(file.key) && decryptedSecrets[file.key]) return;
      if (!isSecretFile(file.key) && decryptedUrls[file.key]) return;

      decryptingRef.current.add(file.key);

      (async () => {
        try {
          const res = await fetch(apiDownloadUrl(file.key));
          const encryptedBlob = await res.blob();

          if (isSecretFile(file.key)) {
            const text = await decryptText(encryptedBlob, currentPassphrase);
            const parsed: SecretPayload = JSON.parse(text);
            setDecryptedSecrets((prev) => ({ ...prev, [file.key]: parsed }));
          } else {
            const plainBlob = await decryptBlob(encryptedBlob, currentPassphrase);
            const url = URL.createObjectURL(plainBlob);
            setDecryptedUrls((prev) => ({ ...prev, [file.key]: url }));
          }
        } catch {
          // wrong passphrase or corrupted data
        }
      })();
    });
  }, [files, currentFolderProtected, currentPassphrase, decryptedUrls, decryptedSecrets]);

  // Debounced global search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery.trim())}`);
        const data = await res.json();
        setSearchResults(data.results || []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  function openFolder(folder: FolderMeta) {
    if (folder.protected && !unlockedFolders.has(folder.id)) {
      setUnlockTarget(folder);
      setUnlockPassphrase("");
      setUnlockError("");
      return;
    }
    setView(folder);
  }

  function handleSearchResultClick(result: SearchResult) {
    setSearchQuery("");
    setSearchResults([]);
    if (result.folder_id) {
      const folder = folders.find((f) => f.id === result.folder_id);
      if (folder) {
        openFolder(folder);
        return;
      }
    }
    setView("root");
  }

  async function handleUnlock() {
    if (!unlockTarget) return;
    setUnlocking(true);
    setUnlockError("");
    try {
      const res = await fetch(`/api/folders/${unlockTarget.id}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase: unlockPassphrase }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Incorrect passphrase.");
      }
      setUnlockedFolders((prev) => new Set(prev).add(unlockTarget.id));
      setUnlockedPassphrases((prev) => ({ ...prev, [unlockTarget.id]: unlockPassphrase }));
      setView(unlockTarget);
      setUnlockTarget(null);
      setUnlockPassphrase("");
    } catch (err) {
      setUnlockError(err instanceof Error ? err.message : "Unlock failed.");
    } finally {
      setUnlocking(false);
    }
  }

  function resetNewFolderForm() {
    setNewFolderName("");
    setNewFolderProtect(false);
    setNewFolderPassphrase("");
    setNewFolderDeleteProtect(false);
    setNewFolderDeleteReuseUnlock(true);
    setNewFolderDeletePassphrase("");
    setNewFolderError("");
  }

  async function handleCreateFolder() {
    if (!newFolderName.trim()) {
      setNewFolderError("Give the folder a name.");
      return;
    }
    if (newFolderProtect && newFolderPassphrase.length < 4) {
      setNewFolderError("Passphrase needs at least 4 characters.");
      return;
    }
    const reuseUnlock = newFolderProtect && newFolderDeleteReuseUnlock;
    if (newFolderDeleteProtect && !reuseUnlock && newFolderDeletePassphrase.length < 4) {
      setNewFolderError("Delete passphrase needs at least 4 characters.");
      return;
    }

    setCreatingFolder(true);
    setNewFolderError("");
    try {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newFolderName.trim(),
          protect: newFolderProtect,
          passphrase: newFolderProtect ? newFolderPassphrase : undefined,
          deleteProtect: newFolderDeleteProtect,
          deleteUsesUnlockPassphrase: reuseUnlock,
          deletePassphrase: newFolderDeleteProtect && !reuseUnlock ? newFolderDeletePassphrase : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Could not create folder.");
      }
      await fetchFolders();
      setShowNewFolder(false);
      resetNewFolderForm();
    } catch (err) {
      setNewFolderError(err instanceof Error ? err.message : "Failed.");
    } finally {
      setCreatingFolder(false);
    }
  }

  function requestDeleteFolder(folder: FolderMeta) {
    setDeleteFolderTarget(folder);
    setDeleteFolderPassphrase("");
    setDeleteFolderError("");
  }

  // Long-press a folder card to delete it (tap still opens it normally)
  const folderPressRef = useRef<{
    timer: ReturnType<typeof setTimeout> | null;
    fired: boolean;
    startX: number;
    startY: number;
  } | null>(null);

  function onFolderPointerDown(e: React.PointerEvent, folder: FolderMeta) {
    folderPressRef.current = { timer: null, fired: false, startX: e.clientX, startY: e.clientY };
    folderPressRef.current.timer = setTimeout(() => {
      if (folderPressRef.current) folderPressRef.current.fired = true;
      requestDeleteFolder(folder);
    }, LONG_PRESS_MS);
  }

  function onFolderPointerMove(e: React.PointerEvent) {
    const p = folderPressRef.current;
    if (!p || !p.timer) return;
    const dx = Math.abs(e.clientX - p.startX);
    const dy = Math.abs(e.clientY - p.startY);
    if (dx > MOVE_THRESHOLD_PX || dy > MOVE_THRESHOLD_PX) {
      clearTimeout(p.timer);
      p.timer = null;
    }
  }

  function onFolderPointerUp() {
    if (folderPressRef.current?.timer) clearTimeout(folderPressRef.current.timer);
  }

  function onFolderClick(e: React.MouseEvent, folder: FolderMeta) {
    if (folderPressRef.current?.fired) {
      e.preventDefault();
      folderPressRef.current = null;
      return;
    }
    openFolder(folder);
  }

  async function confirmDeleteFolder() {
    if (!deleteFolderTarget) return;
    setDeletingFolder(true);
    setDeleteFolderError("");
    try {
      const res = await fetch(`/api/folders/${deleteFolderTarget.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          deleteFolderTarget.deleteProtected ? { passphrase: deleteFolderPassphrase } : {}
        ),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete folder.");
      }
      setDeleteFolderTarget(null);
      if (currentFolderId === deleteFolderTarget.id) setView("root");
      await fetchFolders();
    } catch (err) {
      setDeleteFolderError(err instanceof Error ? err.message : "Failed.");
    } finally {
      setDeletingFolder(false);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError("");

    try {
      let uploadBody: Blob = file;

      if (currentFolderProtected) {
        if (!currentPassphrase) {
          throw new Error("Folder passphrase not available. Please unlock the folder again.");
        }
        uploadBody = await encryptBlob(file, currentPassphrase);
      }

      const urlRes = await fetch("/api/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          folderId: currentFolderId || undefined,
        }),
      });

      if (!urlRes.ok) throw new Error("Failed to get upload URL.");
      const { uploadUrl, key } = await urlRes.json();

      const putRes = await fetch(uploadUrl, { method: "PUT", body: uploadBody });
      if (!putRes.ok) throw new Error("Upload to storage failed.");

      fetch("/api/upload/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key,
          filename: file.name,
          folderId: currentFolderId || null,
          sizeBytes: uploadBody.size,
        }),
      }).catch(() => {
        // Non-fatal: the file is safely uploaded even if the search index write fails
      });

      await fetchFiles(currentFolderId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleAddSecret() {
    if (!currentFolderId || !currentPassphrase) return;

    if (!secretTitle.trim()) {
      setSecretError("Give it a title.");
      return;
    }
    if (secretKind === "note" && !secretBody.trim()) {
      setSecretError("Write something in the note.");
      return;
    }
    if (secretKind === "login" && !secretPassword) {
      setSecretError("Add a password.");
      return;
    }

    setSavingSecret(true);
    setSecretError("");

    try {
      const payload: SecretPayload =
        secretKind === "note"
          ? { kind: "note", title: secretTitle.trim(), body: secretBody }
          : {
              kind: "login",
              title: secretTitle.trim(),
              username: secretUsername,
              password: secretPassword,
            };

      const encryptedBlob = await encryptText(JSON.stringify(payload), currentPassphrase);

      const urlRes = await fetch("/api/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: `${secretKind}.vaultsecret`,
          folderId: currentFolderId,
        }),
      });
      if (!urlRes.ok) throw new Error("Failed to get upload URL.");
      const { uploadUrl, key } = await urlRes.json();

      const putRes = await fetch(uploadUrl, { method: "PUT", body: encryptedBlob });
      if (!putRes.ok) throw new Error("Save failed.");

      fetch("/api/upload/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key,
          filename: secretTitle.trim(),
          folderId: currentFolderId,
          sizeBytes: encryptedBlob.size,
        }),
      }).catch(() => {
        // Non-fatal: the secret is safely saved even if the search index write fails
      });

      await fetchFiles(currentFolderId);
      setShowAddSecret(false);
      setSecretTitle("");
      setSecretBody("");
      setSecretUsername("");
      setSecretPassword("");
      setShowPasswordGen(false);
    } catch (err) {
      setSecretError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSavingSecret(false);
    }
  }

  async function handleDelete(key: string) {
    if (!confirm("Delete this permanently?")) return;
    try {
      const res = await fetch(`/api/files/${encodeURIComponent(key)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed.");
      setFiles((prev) => prev.filter((f) => f.key !== key));
    } catch {
      setError("Failed to delete.");
    }
  }

  async function handleBulkDelete() {
    if (selectedKeys.size === 0) return;
    if (!confirm(`Delete ${selectedKeys.size} file(s) permanently?`)) return;
    const keys = Array.from(selectedKeys);
    try {
      await Promise.all(
        keys.map((k) => fetch(`/api/files/${encodeURIComponent(k)}`, { method: "DELETE" }))
      );
      setFiles((prev) => prev.filter((f) => !selectedKeys.has(f.key)));
      setSelectedKeys(new Set());
    } catch {
      setError("Some files failed to delete.");
    }
  }

  function toggleReveal(key: string) {
    setRevealedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function copyToClipboard(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 1200);
    } catch {
      // clipboard not available; silently ignore
    }
  }

  function openSettings() {
    setShowSettings(true);
    fetchStorage();
  }

  function apiDownloadUrl(key: string) {
    return `/api/files/${encodeURIComponent(key)}/download`;
  }

  function fileSrc(file: VaultFile) {
    if (currentFolderProtected) {
      return decryptedUrls[file.key];
    }
    return file.downloadUrl;
  }

  function triggerDownload(file: VaultFile) {
    const src = fileSrc(file);
    if (!src) return;
    const a = document.createElement("a");
    a.href = src;
    a.download = fileDisplayName(file);
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // ---- Favorites ----
  async function toggleFavoriteFile(file: VaultFile) {
    const newVal = !file.isFavorite;
    try {
      const res = await fetch(`/api/files/${encodeURIComponent(file.key)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFavorite: newVal }),
      });
      if (!res.ok) throw new Error("Failed to update favorite.");
      setFiles((prev) => prev.map((f) => (f.key === file.key ? { ...f, isFavorite: newVal } : f)));
    } catch {
      setError("Failed to update favorite.");
    }
  }

  async function bulkAddFavorites() {
    const keys = Array.from(selectedKeys).filter((k) => !isSecretFile(k));
    if (keys.length === 0) {
      setShowBulkOverflow(false);
      return;
    }
    try {
      await Promise.all(
        keys.map((k) =>
          fetch(`/api/files/${encodeURIComponent(k)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isFavorite: true }),
          })
        )
      );
      setFiles((prev) => prev.map((f) => (keys.includes(f.key) ? { ...f, isFavorite: true } : f)));
      setSelectedKeys(new Set());
    } catch {
      setError("Failed to favorite some files.");
    } finally {
      setShowBulkOverflow(false);
    }
  }

  function selectAllFiles() {
    setSelectedKeys(new Set(regularFiles.map((f) => f.key)));
    setShowBulkOverflow(false);
  }

  // ---- Share ----
  async function handleShare(keys: string[]) {
    try {
      const filesToShare: File[] = [];
      for (const k of keys) {
        const file = files.find((f) => f.key === k);
        if (!file || isSecretFile(k)) continue;
        const fetchUrl = currentFolderProtected ? fileSrc(file) : apiDownloadUrl(file.key);
        if (!fetchUrl) continue;
        const res = await fetch(fetchUrl);
        const blob = await res.blob();
        filesToShare.push(
          new File([blob], fileDisplayName(file), { type: blob.type || "application/octet-stream" })
        );
      }

      if (filesToShare.length === 0) {
        setError("Nothing to share yet \u2014 still decrypting.");
        return;
      }

      const nav = navigator as Navigator & {
        share?: (data: ShareData) => Promise<void>;
        canShare?: (data: ShareData) => boolean;
      };

      if (nav.share && nav.canShare && nav.canShare({ files: filesToShare })) {
        await nav.share({ files: filesToShare });
      } else {
        filesToShare.forEach((f) => {
          const url = URL.createObjectURL(f);
          const a = document.createElement("a");
          a.href = url;
          a.download = f.name;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
        });
      }
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        setError("Share failed.");
      }
    }
  }

  // ---- Rename ----
  function startRename(file: VaultFile) {
    setRenamingKey(file.key);
    setRenameValue(fileDisplayName(file));
  }

  async function saveRename(file: VaultFile) {
    const newName = renameValue.trim();
    if (!newName) {
      setRenamingKey(null);
      return;
    }
    setRenaming(true);
    try {
      const res = await fetch(`/api/files/${encodeURIComponent(file.key)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: newName }),
      });
      if (!res.ok) throw new Error("Rename failed.");
      setFiles((prev) => prev.map((f) => (f.key === file.key ? { ...f, displayName: newName } : f)));
      setRenamingKey(null);
    } catch {
      setError("Failed to rename.");
    } finally {
      setRenaming(false);
    }
  }

  // ---- Bulk selection: long-press + drag ----
  function toggleSelect(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function getKeyFromPoint(x: number, y: number): string | null {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const item = el?.closest("[data-file-key]") as HTMLElement | null;
    return item?.dataset.fileKey || null;
  }

  function onItemPointerDown(e: React.PointerEvent, key: string) {
    pointerStartRef.current = { x: e.clientX, y: e.clientY };
    longPressTimerRef.current = setTimeout(() => {
      isDraggingRef.current = true;
      dragToggledRef.current = new Set([key]);
      toggleSelect(key);
    }, LONG_PRESS_MS);
  }

  function onItemPointerMove(e: React.PointerEvent) {
    if (isDraggingRef.current) {
      const key = getKeyFromPoint(e.clientX, e.clientY);
      if (key && !dragToggledRef.current.has(key)) {
        dragToggledRef.current.add(key);
        toggleSelect(key);
      }
      return;
    }
    if (pointerStartRef.current && longPressTimerRef.current) {
      const dx = Math.abs(e.clientX - pointerStartRef.current.x);
      const dy = Math.abs(e.clientY - pointerStartRef.current.y);
      if (dx > MOVE_THRESHOLD_PX || dy > MOVE_THRESHOLD_PX) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }
  }

  function onItemPointerUp() {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    isDraggingRef.current = false;
    dragToggledRef.current = new Set();
  }

  function onItemClick(e: React.MouseEvent | React.SyntheticEvent, key: string) {
    if (selectedKeys.size > 0) {
      e.preventDefault();
      toggleSelect(key);
    }
  }

  // ---- Move / Copy (shared) ----
  function openTransferModal(mode: "move" | "copy", keys: Set<string>) {
    setTransferMode(mode);
    setTransferKeys(keys);
    setMoveError("");
    setMoveDestPassphraseNeeded(null);
    setMoveDestPassphraseInput("");
    setShowMoveModal(true);
  }

  async function chooseMoveDestination(folder: FolderMeta | null) {
    setMoveError("");
    if (folder && folder.protected && !unlockedFolders.has(folder.id)) {
      setMoveDestPassphraseNeeded(folder);
      return;
    }
    await performTransfer(folder, transferMode);
  }

  async function confirmMoveDestinationPassphrase() {
    if (!moveDestPassphraseNeeded) return;
    setMoving(true);
    setMoveError("");
    try {
      const res = await fetch(`/api/folders/${moveDestPassphraseNeeded.id}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase: moveDestPassphraseInput }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Incorrect passphrase.");
      }
      setUnlockedFolders((prev) => new Set(prev).add(moveDestPassphraseNeeded.id));
      setUnlockedPassphrases((prev) => ({
        ...prev,
        [moveDestPassphraseNeeded.id]: moveDestPassphraseInput,
      }));
      await performTransfer(moveDestPassphraseNeeded, transferMode);
    } catch (err) {
      setMoveError(err instanceof Error ? err.message : "Failed.");
      setMoving(false);
    }
  }

  async function performTransfer(destFolder: FolderMeta | null, mode: "move" | "copy") {
    setMoving(true);
    setMoveError("");
    const destFolderId = destFolder ? destFolder.id : null;
    const destPassphrase = destFolder ? unlockedPassphrases[destFolder.id] : undefined;
    const keys = Array.from(transferKeys);
    let skipped = 0;

    try {
      for (let i = 0; i < keys.length; i++) {
        const oldKey = keys[i];
        const file = files.find((f) => f.key === oldKey);
        if (!file || isSecretFile(oldKey)) continue;

        setMoveProgress(`${mode === "move" ? "Moving" : "Copying"} ${i + 1} of ${keys.length}...`);

        const originalName = fileDisplayName(file);
        const fetchUrl = currentFolderProtected ? decryptedUrls[oldKey] : apiDownloadUrl(oldKey);
        if (currentFolderProtected && !fetchUrl) {
          skipped++;
          continue;
        }

        const res = await fetch(fetchUrl!);
        const plainBlob = await res.blob();

        let uploadBody: Blob = plainBlob;
        if (destFolder?.protected && destPassphrase) {
          uploadBody = await encryptBlob(plainBlob, destPassphrase);
        }

        const urlRes = await fetch("/api/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: originalName, folderId: destFolderId || undefined }),
        });
        if (!urlRes.ok)
          throw new Error(`Failed to get an upload URL while ${mode === "move" ? "moving" : "copying"}.`);
        const { uploadUrl, key: newKey } = await urlRes.json();

        const putRes = await fetch(uploadUrl, { method: "PUT", body: uploadBody });
        if (!putRes.ok) throw new Error(`Failed to write the ${mode === "move" ? "moved" : "copied"} file.`);

        await fetch("/api/upload/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            key: newKey,
            filename: originalName,
            folderId: destFolderId,
            sizeBytes: uploadBody.size,
          }),
        }).catch(() => {});

        if (mode === "move") {
          await fetch(`/api/files/${encodeURIComponent(oldKey)}`, { method: "DELETE" });
        }
      }

      setSelectedKeys(new Set());
      setTransferKeys(new Set());
      setShowMoveModal(false);
      setMoveDestPassphraseNeeded(null);
      setMoveDestPassphraseInput("");
      setMoveProgress("");
      await fetchFiles(currentFolderId);

      if (skipped > 0) {
        setError(`${skipped} file(s) were skipped because they were still decrypting.`);
      }
    } catch (err) {
      setMoveError(err instanceof Error ? err.message : `${mode === "move" ? "Move" : "Copy"} failed.`);
    } finally {
      setMoving(false);
    }
  }

  const totalUsagePercent = storage
    ? Math.min(100, (storage.total.usedBytes / storage.total.limitBytes) * 100)
    : 0;
  const usageColor =
    totalUsagePercent > 90 ? COLORS.danger : totalUsagePercent > 70 ? COLORS.brass : COLORS.sage;

  const selectionActive = selectedKeys.size > 0;
  const selectedTotalBytes = files
    .filter((f) => selectedKeys.has(f.key))
    .reduce((sum, f) => sum + f.size, 0);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: `radial-gradient(circle at 50% 0%, #1a1a20 0%, ${COLORS.bg} 60%)`,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        padding: "1.5rem",
        color: COLORS.text,
      }}
    >
      <div style={{ maxWidth: "600px", margin: "0 auto" }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1rem",
          }}
        >
          <h1 style={{ fontSize: "1.7rem", fontWeight: 700, margin: 0, letterSpacing: "-0.02em", color: COLORS.text }}>
            Vault
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <button
              onClick={openSettings}
              aria-label="Settings"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                border: `1px solid ${COLORS.border}`,
                background: COLORS.surface,
                cursor: "pointer",
              }}
            >
              <GearIcon color={COLORS.muted} />
            </button>
            <label
              style={{
                padding: "0.65rem 1.2rem",
                borderRadius: "999px",
                background: uploading ? COLORS.elevated : COLORS.brass,
                color: uploading ? COLORS.muted : "#1A1305",
                fontWeight: 700,
                fontSize: "0.875rem",
                cursor: uploading ? "not-allowed" : "pointer",
                border: "none",
              }}
            >
              {uploading ? "Uploading..." : "+ Upload"}
              <input type="file" onChange={handleUpload} disabled={uploading} style={{ display: "none" }} />
            </label>
          </div>
        </div>

        {/* Search bar */}
        <div style={{ position: "relative", marginBottom: "1.25rem" }}>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: "0.85rem", top: "50%", transform: "translateY(-50%)" }}>
              <SearchIcon color={COLORS.muted} />
            </span>
            <input
              type="text"
              placeholder="Search files, notes, passwords..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "0.7rem 0.9rem 0.7rem 2.4rem",
                borderRadius: "10px",
                border: `1px solid ${COLORS.border}`,
                background: COLORS.surface,
                color: COLORS.text,
                fontSize: "0.85rem",
              }}
            />
          </div>
          {searchQuery.trim() && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 0.4rem)",
                left: 0,
                right: 0,
                background: COLORS.elevated,
                border: `1px solid ${COLORS.border}`,
                borderRadius: "10px",
                overflow: "hidden",
                zIndex: 40,
                maxHeight: "260px",
                overflowY: "auto",
              }}
            >
              {searching ? (
                <p style={{ margin: 0, padding: "0.75rem", fontSize: "0.8rem", color: COLORS.muted }}>{"Searching\u2026"}</p>
              ) : searchResults.length === 0 ? (
                <p style={{ margin: 0, padding: "0.75rem", fontSize: "0.8rem", color: COLORS.muted }}>No matches.</p>
              ) : (
                searchResults.map((r) => {
                  const folder = folders.find((f) => f.id === r.folder_id);
                  return (
                    <button
                      key={r.file_key}
                      onClick={() => handleSearchResultClick(r)}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        width: "100%",
                        padding: "0.65rem 0.85rem",
                        background: "none",
                        border: "none",
                        borderBottom: `1px solid ${COLORS.border}`,
                        color: COLORS.text,
                        fontSize: "0.85rem",
                        textAlign: "left",
                        cursor: "pointer",
                      }}
                    >
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.display_name}
                      </span>
                      <span style={{ fontSize: "0.7rem", color: COLORS.muted, flexShrink: 0, marginLeft: "0.5rem" }}>
                        {folder ? folder.name : "General"}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Breadcrumb */}
        {inFolder && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
            <button
              onClick={() => setView("root")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                background: "none",
                border: "none",
                color: COLORS.muted,
                fontSize: "0.85rem",
                padding: "0.5rem 0",
                cursor: "pointer",
              }}
            >
              {"\u2190"} All folders
              <span style={{ color: COLORS.text, fontWeight: 600 }}>/ {(view as FolderMeta).name}</span>
              {currentFolderProtected && (
                <span style={{ fontSize: "0.68rem", color: COLORS.sage, fontFamily: FONT_MONO }}>
                  (end-to-end encrypted)
                </span>
              )}
            </button>
            {canAddSecrets && (
              <button
                onClick={() => {
                  setSecretKind("login");
                  setSecretTitle("");
                  setSecretBody("");
                  setSecretUsername("");
                  setSecretPassword("");
                  setSecretError("");
                  setShowPasswordGen(false);
                  setShowAddSecret(true);
                }}
                style={{
                  background: "none",
                  border: `1px solid ${COLORS.sage}55`,
                  borderRadius: "8px",
                  color: COLORS.sage,
                  fontSize: "0.78rem",
                  padding: "0.35rem 0.7rem",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                + Note
              </button>
            )}
          </div>
        )}

        {error && (
          <p style={{ color: COLORS.danger, marginBottom: "1rem", fontSize: "0.85rem" }}>{error}</p>
        )}

        {/* Folder grid - root only */}
        {!inFolder && (
          <div style={{ marginBottom: "2rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <p style={{ margin: 0, fontSize: "0.8rem", color: COLORS.muted }}>Folders</p>
              <button
                onClick={() => {
                  resetNewFolderForm();
                  setShowNewFolder(true);
                }}
                style={{
                  background: "none",
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: "999px",
                  color: COLORS.brass,
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  padding: "0.4rem 0.85rem",
                  cursor: "pointer",
                }}
              >
                + New Folder
              </button>
            </div>

            {folders.length === 0 ? (
              <p style={{ color: COLORS.muted, fontSize: "0.85rem" }}>
                No folders yet. Create one to organize and optionally protect a set of files.
              </p>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "0.85rem" }}>
                {folders.map((folder) => {
                  const isUnlocked = !folder.protected || unlockedFolders.has(folder.id);
                  const accent = folder.protected ? (isUnlocked ? COLORS.sage : COLORS.brass) : COLORS.muted;
                  return (
                    <button
                      key={folder.id}
                      onPointerDown={(e) => onFolderPointerDown(e, folder)}
                      onPointerMove={onFolderPointerMove}
                      onPointerUp={onFolderPointerUp}
                      onPointerCancel={onFolderPointerUp}
                      onClick={(e) => onFolderClick(e, folder)}
                      style={{
                        position: "relative",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-start",
                        gap: "0.9rem",
                        padding: "1.1rem",
                        borderRadius: "20px",
                        background: COLORS.surface,
                        border: "none",
                        textAlign: "left",
                        cursor: "pointer",
                        userSelect: "none",
                      }}
                    >
                      <div
                        style={{
                          width: "38px",
                          height: "38px",
                          borderRadius: "12px",
                          background: `${accent}1F`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {folder.protected ? <KeyholeIcon unlocked={isUnlocked} color={accent} /> : <CompartmentIcon color={accent} />}
                      </div>
                      <div>
                        <p
                          style={{
                            margin: 0,
                            fontSize: "0.95rem",
                            fontWeight: 600,
                            color: COLORS.text,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            maxWidth: "100%",
                          }}
                        >
                          {folder.name}
                        </p>
                        <p style={{ margin: "0.15rem 0 0", fontSize: "0.75rem", color: accent, fontWeight: 500 }}>
                          {folder.protected ? (isUnlocked ? "Unlocked" : "Locked") : "Open"}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Notes & Passwords section */}
        {inFolder && secretFiles.length > 0 && (
          <div style={{ marginBottom: "1.5rem" }}>
            <p style={{ margin: "0 0 0.75rem", fontSize: "0.8rem", color: COLORS.muted }}>Notes &amp; Passwords</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              {secretFiles.map((file) => {
                const secret = decryptedSecrets[file.key];
                const revealed = revealedKeys.has(file.key);
                return (
                  <div
                    key={file.key}
                    style={{
                      padding: "1rem 1.1rem",
                      borderRadius: "18px",
                      background: COLORS.surface,
                      border: "none",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minWidth: 0, gap: "0.75rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.7rem", overflow: "hidden", minWidth: 0 }}>
                        <div
                          style={{
                            width: "34px",
                            height: "34px",
                            borderRadius: "10px",
                            background: `${COLORS.brass}1F`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          {secret?.kind === "note" ? <NoteIcon color={COLORS.brass} /> : <KeyIcon color={COLORS.brass} />}
                        </div>
                        <span style={{ fontSize: "0.95rem", fontWeight: 600, color: COLORS.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {secret ? secret.title : "Decrypting\u2026"}
                        </span>
                      </div>
                      <button
                        onClick={() => handleDelete(file.key)}
                        aria-label="Delete"
                        style={{
                          width: "30px",
                          height: "30px",
                          borderRadius: "50%",
                          background: `${COLORS.danger}22`,
                          color: COLORS.danger,
                          border: "none",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          flexShrink: 0,
                        }}
                      >
                        <TrashIcon color={COLORS.danger} />
                      </button>
                    </div>

                    {secret && secret.kind === "note" && (
                      <p style={{ margin: "0.6rem 0 0", fontSize: "0.85rem", color: COLORS.muted, whiteSpace: "pre-wrap" }}>
                        {secret.body}
                      </p>
                    )}

                    {secret && secret.kind === "login" && (
                      <div style={{ marginTop: "0.6rem", display: "flex", flexDirection: "column", gap: "0.45rem" }}>
                        {secret.username && (
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontFamily: FONT_MONO, fontSize: "0.8rem", color: COLORS.text }}>
                              {secret.username}
                            </span>
                            <button
                              onClick={() => copyToClipboard(secret.username!, `${file.key}-user`)}
                              aria-label="Copy username"
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.3rem",
                                background: "none",
                                border: "none",
                                color: copiedKey === `${file.key}-user` ? COLORS.sage : COLORS.muted,
                                fontSize: "0.7rem",
                                cursor: "pointer",
                                padding: "0.25rem",
                              }}
                            >
                              <CopyIcon color={copiedKey === `${file.key}-user` ? COLORS.sage : COLORS.muted} />
                              {copiedKey === `${file.key}-user` && "Copied"}
                            </button>
                          </div>
                        )}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontFamily: FONT_MONO, fontSize: "0.8rem", color: COLORS.text }}>
                            {revealed ? secret.password : "\u2022".repeat(Math.min(secret.password?.length || 8, 14))}
                          </span>
                          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                            <button
                              onClick={() => toggleReveal(file.key)}
                              aria-label={revealed ? "Hide password" : "Reveal password"}
                              style={{ background: "none", border: "none", color: COLORS.muted, cursor: "pointer", padding: "0.25rem", display: "flex" }}
                            >
                              {revealed ? <EyeOffIcon color={COLORS.muted} /> : <EyeIcon color={COLORS.muted} />}
                            </button>
                            <button
                              onClick={() => copyToClipboard(secret.password!, `${file.key}-pass`)}
                              aria-label="Copy password"
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.3rem",
                                background: "none",
                                border: "none",
                                color: copiedKey === `${file.key}-pass` ? COLORS.sage : COLORS.muted,
                                fontSize: "0.7rem",
                                cursor: "pointer",
                                padding: "0.25rem",
                              }}
                            >
                              <CopyIcon color={copiedKey === `${file.key}-pass` ? COLORS.sage : COLORS.muted} />
                              {copiedKey === `${file.key}-pass` && "Copied"}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Favorites shelf */}
        {favoriteFiles.length > 0 && (
          <div style={{ marginBottom: "1.5rem" }}>
            <p style={{ margin: "0 0 0.75rem", fontSize: "0.8rem", color: COLORS.muted }}>Favorites</p>
            <div style={{ display: "flex", gap: "0.75rem", overflowX: "auto", paddingBottom: "0.25rem" }}>
              {favoriteFiles.map((file) => {
                const src = fileSrc(file);
                const showImage = isImageFile(file.key) && !!src;
                return (
                  <button
                    key={file.key}
                    onClick={() => setRowMenuFile(file)}
                    style={{
                      flexShrink: 0,
                      width: "84px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "0.4rem",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    <div
                      style={{
                        position: "relative",
                        width: "72px",
                        height: "72px",
                        borderRadius: "18px",
                        overflow: "hidden",
                        background: COLORS.surface,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {showImage ? (
                        <img src={src} alt={fileDisplayName(file)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <DocumentIcon color={COLORS.muted} />
                      )}
                      <div style={{ position: "absolute", bottom: "4px", right: "4px" }}>
                        <StarIcon filled color={COLORS.brass} small />
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: "0.7rem",
                        color: COLORS.text,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        maxWidth: "100%",
                      }}
                    >
                      {fileDisplayName(file)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* File list header / selection toolbar */}
        {selectionActive ? (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "0.75rem",
              padding: "0.6rem 0.85rem",
              borderRadius: "10px",
              background: COLORS.elevated,
              border: `1px solid ${COLORS.border}`,
            }}
          >
            <button
              onClick={() => setSelectedKeys(new Set())}
              aria-label="Cancel selection"
              style={{ background: "none", border: "none", color: COLORS.muted, cursor: "pointer", display: "flex", padding: "0.2rem" }}
            >
              <XIcon color={COLORS.muted} />
            </button>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>{selectedKeys.size} selected</span>
              <span style={{ fontSize: "0.7rem", color: COLORS.muted }}>{formatBytes(selectedTotalBytes)}</span>
            </div>
            <div style={{ display: "flex", gap: "0.3rem", alignItems: "center" }}>
              <button
                onClick={() => handleShare(Array.from(selectedKeys))}
                aria-label="Share"
                style={{ width: "32px", height: "32px", borderRadius: "50%", border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <ShareIcon color={COLORS.text} />
              </button>
              <button
                onClick={handleBulkDelete}
                aria-label="Delete"
                style={{ width: "32px", height: "32px", borderRadius: "50%", border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <TrashIcon color={COLORS.danger} />
              </button>
              <button
                onClick={() => setShowBulkOverflow(true)}
                aria-label="More"
                style={{ width: "32px", height: "32px", borderRadius: "50%", border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <MoreIcon color={COLORS.text} />
              </button>
            </div>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "0.75rem",
              gap: "0.5rem",
              flexWrap: "wrap",
            }}
          >
            <p style={{ margin: 0, fontSize: "0.8rem", color: COLORS.muted }}>
              {inFolder ? "Files" : "General"}
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <div
                style={{
                  display: "flex",
                  gap: "0.15rem",
                  background: COLORS.surface,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: "999px",
                  padding: "0.2rem",
                }}
              >
                {(["name", "date", "size"] as const).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => handleSortClick(opt)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.2rem",
                      padding: "0.32rem 0.6rem",
                      borderRadius: "999px",
                      border: "none",
                      background: sortBy === opt ? COLORS.elevated : "transparent",
                      color: sortBy === opt ? COLORS.brass : COLORS.muted,
                      fontSize: "0.7rem",
                      fontWeight: 600,
                      cursor: "pointer",
                      textTransform: "capitalize",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {opt}
                    {sortBy === opt && (sortDir === "asc" ? "\u2191" : "\u2193")}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", gap: "0.25rem", background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: "8px", padding: "0.2rem" }}>
                <button
                  onClick={() => setViewMode("list")}
                  aria-label="List view"
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "28px", height: "28px", borderRadius: "6px", border: "none", background: viewMode === "list" ? COLORS.elevated : "transparent", cursor: "pointer" }}
                >
                  <ListIcon color={viewMode === "list" ? COLORS.text : COLORS.muted} />
                </button>
                <button
                  onClick={() => setViewMode("grid")}
                  aria-label="Grid view"
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "28px", height: "28px", borderRadius: "6px", border: "none", background: viewMode === "grid" ? COLORS.elevated : "transparent", cursor: "pointer" }}
                >
                  <GridIcon color={viewMode === "grid" ? COLORS.text : COLORS.muted} />
                </button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <p style={{ color: COLORS.muted }}>Loading...</p>
        ) : sortedFiles.length === 0 ? (
          <p style={{ color: COLORS.muted }}>Nothing here yet. Upload your first file.</p>
        ) : viewMode === "list" ? (
          <div style={{ display: "flex", flexDirection: "column", background: COLORS.surface, borderRadius: "20px", overflow: "hidden" }}>
            {sortedFiles.map((file, fileIdx) => {
              const src = fileSrc(file);
              const showImage = isImageFile(file.key) && !!src;
              const stillDecrypting = currentFolderProtected && !src;
              const isSelected = selectedKeys.has(file.key);
              const isRenaming = renamingKey === file.key;

              return (
                <div
                  key={file.key}
                  data-file-key={file.key}
                  onPointerDown={(e) => onItemPointerDown(e, file.key)}
                  onPointerMove={onItemPointerMove}
                  onPointerUp={onItemPointerUp}
                  onPointerCancel={onItemPointerUp}
                  onClick={(e) => onItemClick(e, file.key)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "0.9rem 1.1rem",
                    background: isSelected ? "rgba(52,199,89,0.12)" : "transparent",
                    borderBottom: fileIdx < sortedFiles.length - 1 ? `1px solid ${COLORS.border}` : "none",
                    gap: "0.9rem",
                    userSelect: "none",
                    touchAction: selectionActive ? "none" : "auto",
                    position: "relative",
                  }}
                >
                  {selectionActive && (
                    <div
                      style={{
                        width: "22px",
                        height: "22px",
                        borderRadius: "50%",
                        border: `1.5px solid ${isSelected ? COLORS.sage : COLORS.muted}`,
                        background: isSelected ? COLORS.sage : "transparent",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {isSelected && <CheckIcon color="#000" />}
                    </div>
                  )}

                  {showImage ? (
                    <a
                      href={src}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => selectionActive && e.preventDefault()}
                      style={{ flexShrink: 0, display: "block" }}
                    >
                      <img
                        src={src}
                        alt={fileDisplayName(file)}
                        style={{ width: "46px", height: "46px", objectFit: "cover", borderRadius: "12px", display: "block" }}
                      />
                    </a>
                  ) : (
                    <div
                      style={{
                        width: "46px",
                        height: "46px",
                        borderRadius: "12px",
                        background: COLORS.elevated,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {stillDecrypting ? <KeyholeIcon unlocked={false} color={COLORS.brass} /> : <DocumentIcon color={COLORS.muted} />}
                    </div>
                  )}

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", minWidth: 0, flex: 1 }}>
                    <div style={{ overflow: isRenaming ? "visible" : "hidden", minWidth: 0, flex: 1 }}>
                      {isRenaming ? (
                        <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }} onClick={(e) => e.stopPropagation()}>
                          <input
                            autoFocus
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && saveRename(file)}
                            style={{ flex: 1, minWidth: 0, padding: "0.4rem 0.5rem", borderRadius: "6px", border: `1px solid ${COLORS.border}`, background: COLORS.bg, color: COLORS.text, fontSize: "0.85rem" }}
                          />
                          <button
                            onClick={() => saveRename(file)}
                            disabled={renaming}
                            aria-label="Save"
                            style={{ flexShrink: 0, width: "28px", height: "28px", borderRadius: "50%", background: `${COLORS.sage}22`, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                          >
                            <CheckIcon color={COLORS.sage} />
                          </button>
                          <button
                            onClick={() => setRenamingKey(null)}
                            aria-label="Cancel"
                            style={{ flexShrink: 0, width: "28px", height: "28px", borderRadius: "50%", background: COLORS.elevated, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                          >
                            <XIcon color={COLORS.muted} />
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                          {file.isFavorite && <StarIcon filled color={COLORS.brass} small />}
                          <p style={{ margin: 0, fontSize: "0.95rem", fontWeight: 500, color: COLORS.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {fileDisplayName(file)}
                          </p>
                          {!selectionActive && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                startRename(file);
                              }}
                              aria-label="Rename"
                              style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexShrink: 0, padding: "0.15rem" }}
                            >
                              <PencilIcon color={COLORS.muted} />
                            </button>
                          )}
                        </div>
                      )}
                      <p style={{ margin: "0.1rem 0 0", fontSize: "0.8rem", color: COLORS.muted }}>
                        {stillDecrypting ? "Decrypting\u2026" : formatBytes(file.size)}
                      </p>
                    </div>
                    {!isRenaming && !stillDecrypting && !selectionActive && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setRowMenuFile(file);
                        }}
                        aria-label="More options"
                        style={{
                          width: "34px",
                          height: "34px",
                          borderRadius: "50%",
                          border: "none",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: COLORS.elevated,
                          flexShrink: 0,
                        }}
                      >
                        <MoreIcon color={COLORS.text} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.4rem" }}>
            {sortedFiles.map((file) => {
              const src = fileSrc(file);
              const showImage = isImageFile(file.key) && !!src;
              const stillDecrypting = currentFolderProtected && !src;
              const isSelected = selectedKeys.has(file.key);

              return (
                <a
                  key={file.key}
                  data-file-key={file.key}
                  href={src || undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  onPointerDown={(e) => onItemPointerDown(e, file.key)}
                  onPointerMove={onItemPointerMove}
                  onPointerUp={onItemPointerUp}
                  onPointerCancel={onItemPointerUp}
                  onClick={(e) => onItemClick(e, file.key)}
                  style={{
                    position: "relative",
                    aspectRatio: "1 / 1",
                    borderRadius: "8px",
                    overflow: "hidden",
                    background: COLORS.surface,
                    border: `1px solid ${isSelected ? COLORS.sage : COLORS.border}`,
                    display: "block",
                    textDecoration: "none",
                    userSelect: "none",
                    touchAction: selectionActive ? "none" : "auto",
                  }}
                >
                  {selectionActive && (
                    <div
                      style={{
                        position: "absolute",
                        top: "0.4rem",
                        left: "0.4rem",
                        width: "20px",
                        height: "20px",
                        borderRadius: "50%",
                        border: `1.5px solid ${isSelected ? COLORS.sage : "#fff"}`,
                        background: isSelected ? COLORS.sage : "rgba(0,0,0,0.4)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 2,
                      }}
                    >
                      {isSelected && <CheckIcon color="#000" />}
                    </div>
                  )}
                  {!selectionActive && file.isFavorite && (
                    <div style={{ position: "absolute", top: "0.35rem", left: "0.35rem", zIndex: 2 }}>
                      <StarIcon filled color="#fff" small />
                    </div>
                  )}
                  {!selectionActive && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setRowMenuFile(file);
                      }}
                      aria-label="More options"
                      style={{
                        position: "absolute",
                        top: "0.3rem",
                        right: "0.3rem",
                        width: "22px",
                        height: "22px",
                        borderRadius: "50%",
                        background: "rgba(0,0,0,0.55)",
                        border: "none",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 2,
                        cursor: "pointer",
                      }}
                    >
                      <MoreIcon color="#fff" small />
                    </button>
                  )}
                  {stillDecrypting ? (
                    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}><KeyholeIcon unlocked={false} color={COLORS.brass} /></div>
                  ) : showImage ? (
                    <img src={src} alt={fileDisplayName(file)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  ) : (
                    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}><DocumentIcon color={COLORS.muted} /></div>
                  )}
                  <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "0.3rem 0.4rem", background: "linear-gradient(transparent, rgba(0,0,0,0.75))" }}>
                    <p style={{ margin: 0, fontSize: "0.62rem", color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {fileDisplayName(file)}
                    </p>
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </div>

      {/* Per-row action sheet */}
      {rowMenuFile && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 }}
          onClick={() => setRowMenuFile(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: "500px", background: COLORS.elevated, borderTopLeftRadius: "20px", borderTopRightRadius: "20px", padding: "1.25rem", border: `1px solid ${COLORS.border}`, borderBottom: "none" }}
          >
            <p style={{ margin: "0 0 1rem", fontSize: "0.95rem", fontWeight: 600, color: COLORS.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {fileDisplayName(rowMenuFile)}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              <button
                onClick={() => {
                  triggerDownload(rowMenuFile);
                  setRowMenuFile(null);
                }}
                style={sheetActionStyle(COLORS.text)}
              >
                <DownloadIcon color={COLORS.text} /> Download
              </button>
              <button
                onClick={() => {
                  toggleFavoriteFile(rowMenuFile);
                  setRowMenuFile(null);
                }}
                style={sheetActionStyle(COLORS.text)}
              >
                <StarIcon filled={!!rowMenuFile.isFavorite} color={rowMenuFile.isFavorite ? COLORS.brass : COLORS.text} />
                {rowMenuFile.isFavorite ? "Remove from Favorites" : "Add to Favorites"}
              </button>
              <button
                onClick={() => {
                  openTransferModal("move", new Set([rowMenuFile.key]));
                  setRowMenuFile(null);
                }}
                style={sheetActionStyle(COLORS.text)}
              >
                <CompartmentIcon color={COLORS.text} /> Move to
              </button>
              <button
                onClick={() => {
                  openTransferModal("copy", new Set([rowMenuFile.key]));
                  setRowMenuFile(null);
                }}
                style={sheetActionStyle(COLORS.text)}
              >
                <CopyIcon color={COLORS.text} /> Copy to
              </button>
              <button
                onClick={() => {
                  const key = rowMenuFile.key;
                  setRowMenuFile(null);
                  handleDelete(key);
                }}
                style={sheetActionStyle(COLORS.danger)}
              >
                <TrashIcon color={COLORS.danger} /> Delete
              </button>
            </div>
            <button
              onClick={() => setRowMenuFile(null)}
              style={{ width: "100%", padding: "0.75rem", borderRadius: "10px", background: "none", border: `1px solid ${COLORS.border}`, color: COLORS.text, cursor: "pointer", marginTop: "0.75rem" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Bulk selection overflow sheet */}
      {showBulkOverflow && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 }}
          onClick={() => setShowBulkOverflow(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: "500px", background: COLORS.elevated, borderTopLeftRadius: "20px", borderTopRightRadius: "20px", padding: "1.25rem", border: `1px solid ${COLORS.border}`, borderBottom: "none" }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              <button onClick={selectAllFiles} style={sheetActionStyle(COLORS.text)}>
                <CheckIcon color={COLORS.text} /> Select all
              </button>
              <button
                onClick={() => {
                  openTransferModal("move", selectedKeys);
                  setShowBulkOverflow(false);
                }}
                style={sheetActionStyle(COLORS.text)}
              >
                <CompartmentIcon color={COLORS.text} /> Move to
              </button>
              <button
                onClick={() => {
                  openTransferModal("copy", selectedKeys);
                  setShowBulkOverflow(false);
                }}
                style={sheetActionStyle(COLORS.text)}
              >
                <CopyIcon color={COLORS.text} /> Copy to
              </button>
              <button onClick={bulkAddFavorites} style={sheetActionStyle(COLORS.text)}>
                <StarIcon color={COLORS.text} /> Add to Favorites
              </button>
            </div>
            <button
              onClick={() => setShowBulkOverflow(false)}
              style={{ width: "100%", padding: "0.75rem", borderRadius: "10px", background: "none", border: `1px solid ${COLORS.border}`, color: COLORS.text, cursor: "pointer", marginTop: "0.75rem" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* New Folder modal */}
      {showNewFolder && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 }}
          onClick={() => setShowNewFolder(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: "500px", maxHeight: "85vh", overflowY: "auto", background: COLORS.elevated, borderTopLeftRadius: "20px", borderTopRightRadius: "20px", padding: "1.5rem", border: `1px solid ${COLORS.border}`, borderBottom: "none" }}
          >
            <h2 style={{ margin: "0 0 1rem", fontSize: "1.1rem", fontWeight: 600 }}>New folder</h2>
            <input
              type="text"
              placeholder="Folder name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              style={{ width: "100%", boxSizing: "border-box", padding: "0.75rem", borderRadius: "10px", border: `1px solid ${COLORS.border}`, background: COLORS.bg, color: COLORS.text, fontSize: "0.9rem", marginBottom: "1rem" }}
            />
            <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", fontSize: "0.9rem", cursor: "pointer" }}>
              Protect this folder with a passphrase
              <input type="checkbox" checked={newFolderProtect} onChange={(e) => setNewFolderProtect(e.target.checked)} />
            </label>
            {newFolderProtect && (
              <input
                type="password"
                autoComplete="new-password"
                placeholder="Passphrase (min 4 characters)"
                value={newFolderPassphrase}
                onChange={(e) => setNewFolderPassphrase(e.target.value)}
                style={{ width: "100%", boxSizing: "border-box", padding: "0.75rem", borderRadius: "10px", border: `1px solid ${COLORS.brass}55`, background: COLORS.bg, color: COLORS.text, fontSize: "0.9rem", marginBottom: "1rem" }}
              />
            )}

            <div style={{ height: "1px", background: COLORS.border, margin: "0.5rem 0 1rem" }} />

            <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem", fontSize: "0.9rem", cursor: "pointer" }}>
              Require a password to delete this folder
              <input type="checkbox" checked={newFolderDeleteProtect} onChange={(e) => setNewFolderDeleteProtect(e.target.checked)} />
            </label>

            {newFolderDeleteProtect && newFolderProtect && (
              <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem", fontSize: "0.85rem", color: COLORS.muted, cursor: "pointer" }}>
                Use same password as unlock
                <input type="checkbox" checked={newFolderDeleteReuseUnlock} onChange={(e) => setNewFolderDeleteReuseUnlock(e.target.checked)} />
              </label>
            )}

            {newFolderDeleteProtect && (!newFolderProtect || !newFolderDeleteReuseUnlock) && (
              <input
                type="password"
                autoComplete="new-password"
                placeholder="Delete passphrase (min 4 characters)"
                value={newFolderDeletePassphrase}
                onChange={(e) => setNewFolderDeletePassphrase(e.target.value)}
                style={{ width: "100%", boxSizing: "border-box", padding: "0.75rem", borderRadius: "10px", border: `1px solid ${COLORS.danger}55`, background: COLORS.bg, color: COLORS.text, fontSize: "0.9rem", marginBottom: "0.75rem" }}
              />
            )}

            {(newFolderProtect || newFolderDeleteProtect) && (
              <p style={{ fontSize: "0.75rem", color: COLORS.muted, marginTop: 0 }}>
                There's no way to recover a protected folder or override deletion if you forget these passphrases.
              </p>
            )}

            {newFolderError && <p style={{ color: COLORS.danger, fontSize: "0.8rem" }}>{newFolderError}</p>}
            <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
              <button onClick={() => setShowNewFolder(false)} style={{ flex: 1, padding: "0.75rem", borderRadius: "10px", background: "none", border: `1px solid ${COLORS.border}`, color: COLORS.text, cursor: "pointer" }}>
                Cancel
              </button>
              <button
                onClick={handleCreateFolder}
                disabled={creatingFolder}
                style={{ flex: 1, padding: "0.75rem", borderRadius: "10px", background: "#fff", color: "#000", border: "none", fontWeight: 600, cursor: creatingFolder ? "not-allowed" : "pointer", opacity: creatingFolder ? 0.6 : 1 }}
              >
                {creatingFolder ? "Creating..." : "Create folder"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unlock modal */}
      {unlockTarget && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 }}
          onClick={() => setUnlockTarget(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: "500px", background: COLORS.elevated, borderTopLeftRadius: "20px", borderTopRightRadius: "20px", padding: "1.5rem", border: `1px solid ${COLORS.brass}55`, borderBottom: "none" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "1rem" }}>
              <KeyholeIcon unlocked={false} color={COLORS.brass} />
              <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 600 }}>{unlockTarget.name}</h2>
            </div>
            <input
              type="password"
              autoComplete="off"
              placeholder="Enter passphrase"
              value={unlockPassphrase}
              onChange={(e) => setUnlockPassphrase(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
              autoFocus
              style={{ width: "100%", boxSizing: "border-box", padding: "0.75rem", borderRadius: "10px", border: `1px solid ${COLORS.border}`, background: COLORS.bg, color: COLORS.text, fontSize: "0.9rem", marginBottom: "0.75rem" }}
            />
            {unlockError && <p style={{ color: COLORS.danger, fontSize: "0.8rem" }}>{unlockError}</p>}
            <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.75rem" }}>
              <button onClick={() => setUnlockTarget(null)} style={{ flex: 1, padding: "0.75rem", borderRadius: "10px", background: "none", border: `1px solid ${COLORS.border}`, color: COLORS.text, cursor: "pointer" }}>
                Cancel
              </button>
              <button
                onClick={handleUnlock}
                disabled={unlocking}
                style={{ flex: 1, padding: "0.75rem", borderRadius: "10px", background: COLORS.brass, color: "#000", border: "none", fontWeight: 600, cursor: unlocking ? "not-allowed" : "pointer", opacity: unlocking ? 0.6 : 1 }}
              >
                {unlocking ? "Unlocking..." : "Unlock"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete folder modal */}
      {deleteFolderTarget && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 }}
          onClick={() => setDeleteFolderTarget(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: "500px", background: COLORS.elevated, borderTopLeftRadius: "20px", borderTopRightRadius: "20px", padding: "1.5rem", border: `1px solid ${COLORS.danger}55`, borderBottom: "none" }}
          >
            <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.1rem", fontWeight: 600 }}>Delete "{deleteFolderTarget.name}"?</h2>
            <p style={{ fontSize: "0.85rem", color: COLORS.muted, margin: "0 0 1rem" }}>
              This permanently deletes the folder and everything inside it. This can't be undone.
            </p>
            {deleteFolderTarget.deleteProtected && (
              <input
                type="password"
                autoComplete="off"
                placeholder="Enter delete passphrase"
                value={deleteFolderPassphrase}
                onChange={(e) => setDeleteFolderPassphrase(e.target.value)}
                autoFocus
                style={{ width: "100%", boxSizing: "border-box", padding: "0.75rem", borderRadius: "10px", border: `1px solid ${COLORS.border}`, background: COLORS.bg, color: COLORS.text, fontSize: "0.9rem", marginBottom: "0.75rem" }}
              />
            )}
            {deleteFolderError && <p style={{ color: COLORS.danger, fontSize: "0.8rem" }}>{deleteFolderError}</p>}
            <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.75rem" }}>
              <button onClick={() => setDeleteFolderTarget(null)} style={{ flex: 1, padding: "0.75rem", borderRadius: "10px", background: "none", border: `1px solid ${COLORS.border}`, color: COLORS.text, cursor: "pointer" }}>
                Cancel
              </button>
              <button
                onClick={confirmDeleteFolder}
                disabled={deletingFolder}
                style={{ flex: 1, padding: "0.75rem", borderRadius: "10px", background: COLORS.danger, color: "#000", border: "none", fontWeight: 600, cursor: deletingFolder ? "not-allowed" : "pointer", opacity: deletingFolder ? 0.6 : 1 }}
              >
                {deletingFolder ? "Deleting..." : "Delete folder"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Move / Copy modal */}
      {showMoveModal && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 }}
          onClick={() => !moving && setShowMoveModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: "500px", maxHeight: "80vh", overflowY: "auto", background: COLORS.elevated, borderTopLeftRadius: "20px", borderTopRightRadius: "20px", padding: "1.5rem", border: `1px solid ${COLORS.border}`, borderBottom: "none" }}
          >
            <h2 style={{ margin: "0 0 1rem", fontSize: "1.1rem", fontWeight: 600 }}>
              {transferMode === "move" ? "Move" : "Copy"} {transferKeys.size} file{transferKeys.size === 1 ? "" : "s"}
            </h2>

            {moveDestPassphraseNeeded ? (
              <>
                <p style={{ fontSize: "0.85rem", color: COLORS.muted, margin: "0 0 0.75rem" }}>
                  "{moveDestPassphraseNeeded.name}" is locked. Enter its passphrase to {transferMode} files there.
                </p>
                <input
                  type="password"
                  autoFocus
                  placeholder="Enter passphrase"
                  value={moveDestPassphraseInput}
                  onChange={(e) => setMoveDestPassphraseInput(e.target.value)}
                  style={{ width: "100%", boxSizing: "border-box", padding: "0.75rem", borderRadius: "10px", border: `1px solid ${COLORS.border}`, background: COLORS.bg, color: COLORS.text, fontSize: "0.9rem", marginBottom: "0.75rem" }}
                />
                {moveError && <p style={{ color: COLORS.danger, fontSize: "0.8rem" }}>{moveError}</p>}
                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <button onClick={() => setMoveDestPassphraseNeeded(null)} style={{ flex: 1, padding: "0.75rem", borderRadius: "10px", background: "none", border: `1px solid ${COLORS.border}`, color: COLORS.text, cursor: "pointer" }}>
                    Back
                  </button>
                  <button
                    onClick={confirmMoveDestinationPassphrase}
                    disabled={moving}
                    style={{ flex: 1, padding: "0.75rem", borderRadius: "10px", background: COLORS.brass, color: "#000", border: "none", fontWeight: 600, cursor: moving ? "not-allowed" : "pointer", opacity: moving ? 0.6 : 1 }}
                  >
                    {moving ? moveProgress || "Working..." : transferMode === "move" ? "Unlock & Move" : "Unlock & Copy"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1rem" }}>
                  {transferMode === "copy" && (
                    <button
                      onClick={() => chooseMoveDestination(inFolder ? (view as FolderMeta) : null)}
                      disabled={moving}
                      style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.75rem", borderRadius: "10px", background: COLORS.surface, border: `1px solid ${COLORS.brass}55`, color: COLORS.text, fontSize: "0.9rem", cursor: moving ? "not-allowed" : "pointer", textAlign: "left" }}
                    >
                      <CopyIcon color={COLORS.brass} /> Duplicate in place
                    </button>
                  )}
                  {currentFolderId !== null && (
                    <button
                      onClick={() => chooseMoveDestination(null)}
                      disabled={moving}
                      style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.75rem", borderRadius: "10px", background: COLORS.surface, border: `1px solid ${COLORS.border}`, color: COLORS.text, fontSize: "0.9rem", cursor: moving ? "not-allowed" : "pointer", textAlign: "left" }}
                    >
                      <CompartmentIcon color={COLORS.muted} /> General
                    </button>
                  )}
                  {folders
                    .filter((f) => f.id !== currentFolderId)
                    .map((f) => (
                      <button
                        key={f.id}
                        onClick={() => chooseMoveDestination(f)}
                        disabled={moving}
                        style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.75rem", borderRadius: "10px", background: COLORS.surface, border: `1px solid ${COLORS.border}`, color: COLORS.text, fontSize: "0.9rem", cursor: moving ? "not-allowed" : "pointer", textAlign: "left" }}
                      >
                        {f.protected ? <KeyholeIcon unlocked={unlockedFolders.has(f.id)} color={COLORS.brass} /> : <CompartmentIcon color={COLORS.muted} />} {f.name}
                      </button>
                    ))}
                </div>
                {moving && <p style={{ fontSize: "0.8rem", color: COLORS.muted }}>{moveProgress || "Working..."}</p>}
                {moveError && <p style={{ color: COLORS.danger, fontSize: "0.8rem" }}>{moveError}</p>}
                <button
                  onClick={() => setShowMoveModal(false)}
                  disabled={moving}
                  style={{ width: "100%", padding: "0.75rem", borderRadius: "10px", background: "none", border: `1px solid ${COLORS.border}`, color: COLORS.text, cursor: moving ? "not-allowed" : "pointer" }}
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Add Note/Login modal */}
      {showAddSecret && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 }}
          onClick={() => setShowAddSecret(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: "500px", maxHeight: "85vh", overflowY: "auto", background: COLORS.elevated, borderTopLeftRadius: "20px", borderTopRightRadius: "20px", padding: "1.5rem", border: `1px solid ${COLORS.sage}55`, borderBottom: "none" }}
          >
            <h2 style={{ margin: "0 0 1rem", fontSize: "1.1rem", fontWeight: 600 }}>Save a note or password</h2>

            <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
              {(["login", "note"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setSecretKind(k)}
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.4rem",
                    padding: "0.6rem",
                    borderRadius: "8px",
                    border: `1px solid ${secretKind === k ? COLORS.sage : COLORS.border}`,
                    background: secretKind === k ? `${COLORS.sage}22` : "transparent",
                    color: secretKind === k ? COLORS.sage : COLORS.muted,
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {k === "login" ? <KeyIcon color={secretKind === k ? COLORS.sage : COLORS.muted} /> : <NoteIcon color={secretKind === k ? COLORS.sage : COLORS.muted} />}
                  {k === "login" ? "Login" : "Note"}
                </button>
              ))}
            </div>

            <input
              type="text"
              placeholder="Title (e.g. Gmail, Wi-Fi, Passport number)"
              value={secretTitle}
              onChange={(e) => setSecretTitle(e.target.value)}
              style={{ width: "100%", boxSizing: "border-box", padding: "0.75rem", borderRadius: "10px", border: `1px solid ${COLORS.border}`, background: COLORS.bg, color: COLORS.text, fontSize: "0.9rem", marginBottom: "0.75rem" }}
            />

            {secretKind === "login" ? (
              <>
                <input
                  type="text"
                  autoComplete="off"
                  placeholder="Username or email (optional)"
                  value={secretUsername}
                  onChange={(e) => setSecretUsername(e.target.value)}
                  style={{ width: "100%", boxSizing: "border-box", padding: "0.75rem", borderRadius: "10px", border: `1px solid ${COLORS.border}`, background: COLORS.bg, color: COLORS.text, fontSize: "0.9rem", marginBottom: "0.75rem" }}
                />
                <input
                  type="text"
                  autoComplete="off"
                  placeholder="Password"
                  value={secretPassword}
                  onChange={(e) => setSecretPassword(e.target.value)}
                  style={{ width: "100%", boxSizing: "border-box", padding: "0.75rem", borderRadius: "10px", border: `1px solid ${COLORS.border}`, background: COLORS.bg, color: COLORS.text, fontSize: "0.9rem", fontFamily: FONT_MONO, marginBottom: "0.5rem" }}
                />

                <button
                  onClick={() => setShowPasswordGen((v) => !v)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    background: "none",
                    border: "none",
                    color: COLORS.brass,
                    fontSize: "0.78rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    padding: "0.2rem 0",
                    marginBottom: showPasswordGen ? "0.6rem" : "0.75rem",
                  }}
                >
                  {showPasswordGen ? "Hide generator" : "Generate a password"}
                </button>

                {showPasswordGen && (
                  <div style={{ padding: "0.9rem", borderRadius: "12px", background: COLORS.bg, border: `1px solid ${COLORS.border}`, marginBottom: "0.75rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                      <span style={{ fontSize: "0.78rem", color: COLORS.muted }}>Length</span>
                      <span style={{ fontSize: "0.78rem", color: COLORS.text, fontFamily: FONT_MONO }}>{genLength}</span>
                    </div>
                    <input
                      type="range"
                      min={8}
                      max={32}
                      value={genLength}
                      onChange={(e) => setGenLength(Number(e.target.value))}
                      style={{ width: "100%", marginBottom: "0.75rem", accentColor: COLORS.brass }}
                    />
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.75rem" }}>
                      {(
                        [
                          ["ABC", genUseUpper, setGenUseUpper],
                          ["abc", genUseLower, setGenUseLower],
                          ["123", genUseNumbers, setGenUseNumbers],
                          ["#$&", genUseSymbols, setGenUseSymbols],
                        ] as const
                      ).map(([label, val, setter]) => (
                        <button
                          key={label}
                          onClick={() => setter(!val)}
                          style={{
                            padding: "0.35rem 0.65rem",
                            borderRadius: "999px",
                            border: `1px solid ${val ? COLORS.brass : COLORS.border}`,
                            background: val ? `${COLORS.brass}22` : "transparent",
                            color: val ? COLORS.brass : COLORS.muted,
                            fontSize: "0.75rem",
                            fontFamily: FONT_MONO,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={generatePassword}
                      style={{
                        width: "100%",
                        padding: "0.6rem",
                        borderRadius: "10px",
                        border: "none",
                        background: COLORS.brass,
                        color: "#1A1305",
                        fontWeight: 700,
                        fontSize: "0.8rem",
                        cursor: "pointer",
                      }}
                    >
                      Use this password
                    </button>
                  </div>
                )}
              </>
            ) : (
              <textarea
                placeholder="Write your note..."
                value={secretBody}
                onChange={(e) => setSecretBody(e.target.value)}
                rows={4}
                style={{ width: "100%", boxSizing: "border-box", padding: "0.75rem", borderRadius: "10px", border: `1px solid ${COLORS.border}`, background: COLORS.bg, color: COLORS.text, fontSize: "0.9rem", marginBottom: "0.75rem", resize: "vertical", fontFamily: "inherit" }}
              />
            )}

            {secretError && <p style={{ color: COLORS.danger, fontSize: "0.8rem" }}>{secretError}</p>}

            <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem" }}>
              <button onClick={() => setShowAddSecret(false)} style={{ flex: 1, padding: "0.75rem", borderRadius: "10px", background: "none", border: `1px solid ${COLORS.border}`, color: COLORS.text, cursor: "pointer" }}>
                Cancel
              </button>
              <button
                onClick={handleAddSecret}
                disabled={savingSecret}
                style={{ flex: 1, padding: "0.75rem", borderRadius: "10px", background: COLORS.sage, color: "#000", border: "none", fontWeight: 600, cursor: savingSecret ? "not-allowed" : "pointer", opacity: savingSecret ? 0.6 : 1 }}
              >
                {savingSecret ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings / storage modal */}
      {showSettings && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 }}
          onClick={() => setShowSettings(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "500px",
              maxHeight: "85vh",
              overflowY: "auto",
              background: COLORS.bg,
              borderTopLeftRadius: "28px",
              borderTopRightRadius: "28px",
              padding: "1.75rem 1.25rem 1.5rem",
              border: "none",
            }}
          >
            <h2 style={{ margin: "0 0 1.5rem", fontSize: "1.7rem", fontWeight: 700, color: COLORS.text, letterSpacing: "-0.02em" }}>
              Settings
            </h2>

            <p style={{ margin: "0 0 0.6rem", fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.06em", color: COLORS.muted, textTransform: "uppercase" }}>
              Storage
            </p>

            {storageLoading && !storage ? (
              <p style={{ color: COLORS.muted, fontSize: "0.85rem" }}>{"Loading storage usage\u2026"}</p>
            ) : storage ? (
              <>
                <div
                  style={{
                    padding: "1.1rem 1.15rem",
                    borderRadius: "20px",
                    background: COLORS.surface,
                    marginBottom: "1.5rem",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.65rem" }}>
                    <span style={{ fontSize: "1.05rem", fontWeight: 700, color: COLORS.text }}>
                      {formatBytes(storage.total.usedBytes)} <span style={{ color: COLORS.muted, fontWeight: 500, fontSize: "0.85rem" }}>of {formatBytes(storage.total.limitBytes)}</span>
                    </span>
                    <span style={{ fontSize: "0.8rem", color: usageColor, fontWeight: 600 }}>
                      {totalUsagePercent.toFixed(2)}%
                    </span>
                  </div>
                  <div style={{ height: "6px", borderRadius: "3px", background: COLORS.bg, overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${totalUsagePercent}%`,
                        background: usageColor,
                        borderRadius: "3px",
                        transition: "width 0.3s ease",
                      }}
                    />
                  </div>
                  {totalUsagePercent > 80 && (
                    <p style={{ margin: "0.7rem 0 0", fontSize: "0.78rem", color: usageColor }}>
                      Getting close to your free storage limit - consider clearing out unused files.
                    </p>
                  )}
                </div>

                {storage.providers.map((provider) => (
                  <div key={provider.id} style={{ marginBottom: "1.5rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem" }}>
                      <span style={{ fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.06em", color: COLORS.muted, textTransform: "uppercase" }}>
                        {provider.label}
                      </span>
                      <span style={{ fontSize: "0.75rem", color: COLORS.muted }}>{formatBytes(provider.usedBytes)}</span>
                    </div>

                    <div style={{ borderRadius: "20px", background: COLORS.surface, overflow: "hidden" }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.85rem",
                          padding: "0.95rem 1.1rem",
                          borderBottom: provider.folders.length > 0 ? `1px solid ${COLORS.border}` : "none",
                        }}
                      >
                        <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: COLORS.elevated, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <CompartmentIcon color={COLORS.muted} />
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <p style={{ margin: 0, fontSize: "0.92rem", fontWeight: 500, color: COLORS.text }}>General</p>
                          <p style={{ margin: "0.1rem 0 0", fontSize: "0.78rem", color: COLORS.muted }}>
                            {provider.general.count} file{provider.general.count === 1 ? "" : "s"} {"\u00b7"} {formatBytes(provider.general.bytes)}
                          </p>
                        </div>
                      </div>

                      {provider.folders.map((folder, i) => (
                        <div
                          key={folder.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.85rem",
                            padding: "0.95rem 1.1rem",
                            borderBottom: i < provider.folders.length - 1 ? `1px solid ${COLORS.border}` : "none",
                          }}
                        >
                          <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: `${COLORS.brass}1F`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            {folder.protected ? <KeyholeIcon unlocked={false} color={COLORS.brass} /> : <CompartmentIcon color={COLORS.brass} />}
                          </div>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <p style={{ margin: 0, fontSize: "0.92rem", fontWeight: 500, color: COLORS.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {folder.name}
                            </p>
                            <p style={{ margin: "0.1rem 0 0", fontSize: "0.78rem", color: COLORS.muted }}>
                              {folder.count} file{folder.count === 1 ? "" : "s"} {"\u00b7"} {formatBytes(folder.bytes)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            ) : (
              <p style={{ color: COLORS.muted, fontSize: "0.85rem" }}>Couldn't load storage usage.</p>
            )}

            <button
              onClick={() => setShowSettings(false)}
              style={{ width: "100%", padding: "0.85rem", borderRadius: "999px", background: COLORS.surface, border: "none", color: COLORS.text, fontWeight: 600, cursor: "pointer", marginTop: "0.5rem" }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function sheetActionStyle(color: string): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    width: "100%",
    padding: "0.85rem 0.5rem",
    background: "none",
    border: "none",
    color,
    fontSize: "0.9rem",
    fontWeight: 500,
    cursor: "pointer",
    textAlign: "left",
  };
}