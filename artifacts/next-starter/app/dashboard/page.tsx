"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { encryptBlob, decryptBlob, encryptText, decryptText } from "@/lib/crypto";
import { startRegistration, startAuthentication } from "@simplewebauthn/browser";
import { wrapPassphraseWithPrf, unwrapPassphraseWithPrf, prfSaltToBytes, normalizePrfSecret } from "@/lib/prfCrypto";
import { isValidBase32Secret } from "@/lib/totp";
import TotpDisplay from "@/components/TotpDisplay";
import { Capacitor } from "@capacitor/core";
import { BiometricAuth } from "@aparajita/capacitor-biometric-auth";
import { SecureStorage } from "@aparajita/capacitor-secure-storage";

interface VaultFile {
  key: string;
  size: number;
  lastModified: string;
  downloadUrl: string;
  displayName?: string | null;
  isFavorite?: boolean;
  tags?: string[];
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
  totpSecret?: string;
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

function SearchIcon({ color, size = 16, strokeWidth = 1.8 }: { color: string; size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="11" cy="11" r="7" stroke={color} strokeWidth={strokeWidth} />
      <path d="M20 20l-4-4" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
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

function TagIcon({ color, small }: { color: string; small?: boolean }) {
  const size = small ? "13" : "16";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M11.5 3h6a1 1 0 0 1 1 1v6a1 1 0 0 1-.29.71l-8.5 8.5a1 1 0 0 1-1.42 0l-6-6a1 1 0 0 1 0-1.42l8.5-8.5A1 1 0 0 1 11.5 3Z"
        stroke={color}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="15.5" cy="7.5" r="1.4" fill={color} />
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

function HomeIcon({ color, size = 22, strokeWidth = 1.8, filled = false }: { color: string; size?: number; strokeWidth?: number; filled?: boolean }) {
  if (filled) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" fill={color} />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M4 11.5 12 4l8 7.5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 10v9a1 1 0 0 0 1 1h3v-5.5h4V20h3a1 1 0 0 0 1-1v-9" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UploadIcon({ color, size = 24, strokeWidth = 2.1 }: { color: string; size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 16V4" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <path d="M7 8.5 12 4l5 4.5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  );
}

function PersonIcon({ color, size = 22, strokeWidth = 1.8 }: { color: string; size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8" r="3.4" stroke={color} strokeWidth={strokeWidth} />
      <path d="M5 20c0-3.6 3.1-6.5 7-6.5s7 2.9 7 6.5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  );
}

type JellySpringState = { value: number; velocity: number };

function advanceJellySpring(spring: JellySpringState, target: number, stiffness: number, dampingRatio: number, seconds: number) {
  const displacement = spring.value - target;
  const frequency = Math.sqrt(stiffness);
  if (dampingRatio === 1) {
    const decay = Math.exp(-frequency * seconds);
    const coefficient = spring.velocity + frequency * displacement;
    spring.value = target + (displacement + coefficient * seconds) * decay;
    spring.velocity = (spring.velocity - frequency * coefficient * seconds) * decay;
    return;
  }

  const damping = dampingRatio * frequency;
  const dampedFrequency = frequency * Math.sqrt(1 - dampingRatio * dampingRatio);
  const decay = Math.exp(-damping * seconds);
  const cosine = Math.cos(dampedFrequency * seconds);
  const sine = Math.sin(dampedFrequency * seconds);
  const positionCoefficient = (spring.velocity + damping * displacement) / dampedFrequency;
  const velocityCoefficient = (damping * spring.velocity + stiffness * displacement) / dampedFrequency;
  spring.value = target + decay * (displacement * cosine + positionCoefficient * sine);
  spring.velocity = decay * (spring.velocity * cosine - velocityCoefficient * sine);
}

function jellyRubberBand(distance: number, dimension: number) {
  if (distance === 0 || dimension <= 0) return 0;
  const damped = (1 - 1 / (Math.abs(distance) * 0.14 / dimension + 1)) * dimension;
  return distance < 0 ? -damped : damped;
}

function jellyPanelOffset(rawOffset: number, width: number) {
  if (width <= 0 || rawOffset === 0) return 0;
  const fraction = Math.max(-1, Math.min(1, rawOffset / width));
  const x = Math.abs(fraction);
  let low = 0;
  let high = 1;
  let parameter = x;
  for (let i = 0; i < 10; i++) {
    const bezierX = parameter * parameter * (3 * (1 - parameter) * 0.58 + parameter);
    if (bezierX < x) low = parameter;
    else high = parameter;
    parameter = (low + high) / 2;
  }
  const eased = parameter * parameter * (3 * (1 - parameter) + parameter);
  return (fraction < 0 ? -4 : 4) * eased;
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
  const [secretTotpSecret, setSecretTotpSecret] = useState("");
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

  const [biometricGlobalEnabled, setBiometricGlobalEnabled] = useState<boolean | null>(null);
  const [biometricFolderEnabled, setBiometricFolderEnabled] = useState<Record<string, boolean>>({});
  const [biometricBusy, setBiometricBusy] = useState(false);
  const [biometricPinPrompt, setBiometricPinPrompt] = useState<{ scope: string; label: string; enabling: boolean } | null>(null);
  const [biometricPinValue, setBiometricPinValue] = useState("");
  const [biometricPinError, setBiometricPinError] = useState("");
  const [unlockBiometricBusy, setUnlockBiometricBusy] = useState(false);

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

  const [allTags, setAllTags] = useState<string[]>([]);
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
  const [tagFilterResults, setTagFilterResults] = useState<SearchResult[]>([]);
  const [tagFilterLoading, setTagFilterLoading] = useState(false);
  const [tagEditorFile, setTagEditorFile] = useState<VaultFile | null>(null);
  const [tagEditorTags, setTagEditorTags] = useState<string[]>([]);
  const [tagEditorInput, setTagEditorInput] = useState("");
  const [tagEditorSaving, setTagEditorSaving] = useState(false);

  const [highlightedFileKey, setHighlightedFileKey] = useState<string | null>(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function flashHighlight(key: string) {
    setHighlightedFileKey(key);
    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    highlightTimeoutRef.current = setTimeout(() => setHighlightedFileKey(null), 2500);
  }

  const inFolder = view !== "root";
  const currentFolderId = inFolder ? (view as FolderMeta).id : null;
  const currentFolderProtected = inFolder && (view as FolderMeta).protected;
  const currentPassphrase = currentFolderId ? unlockedPassphrases[currentFolderId] : undefined;
  const canAddSecrets = Boolean(currentFolderProtected && currentPassphrase);

  const uploadInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchBarOpen, setSearchBarOpen] = useState(false);
  const [showProfileSwitcher, setShowProfileSwitcher] = useState(false);
  const profileLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const profileLongPressFiredRef = useRef(false);
  const [showNavLabels, setShowNavLabels] = useState(true);
  const [activeNavTab, setActiveNavTab] = useState<"home" | "search" | "profile">("home");
  const lastScrollYRef = useRef(0);
  const navBarRef = useRef<HTMLDivElement>(null);
  const navBtnRefs = useRef<(HTMLButtonElement | null)[]>([null, null, null, null]);
  const navActiveItemRefs = useRef<(HTMLDivElement | null)[]>([null, null, null, null]);
  const pillRef = useRef<HTMLDivElement>(null);
  const pillGlowRef = useRef<HTMLDivElement>(null);
  const amberRowRef = useRef<HTMLDivElement>(null);
  const navMetricsUpdaterRef = useRef<() => void>(() => {});
  const suppressNavClickRef = useRef(false);
  const suppressNavClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const physicsRef = useRef({
    position: { value: 0, velocity: 0 },
    positionVelocity: { value: 0, velocity: 0 },
    press: { value: 0, velocity: 0 },
    scaleX: { value: 1, velocity: 0 },
    scaleY: { value: 1, velocity: 0 },
    panel: { value: 0, velocity: 0 },
    trackY: { value: 0, velocity: 0 },
    trackX: { value: 1, velocity: 0 },
    trackPress: { value: 1, velocity: 0 },
    glow: { value: 0, velocity: 0 },
    targetIndex: 0,
    pressTarget: 0,
    shapeTarget: 1,
    releasePending: false,
    returnAfterRelease: false,
    dragging: false,
    pointerId: null as number | null,
    downX: 0,
    downY: 0,
    startX: 0,
    startClientY: 0,
    startY: 0,
    startIndex: 0,
    startPanel: 0,
    maxMoved: 0,
    originX: 0,
    barWidth: 0,
    barHeight: 72,
    slotWidth: 0,
    dragSlotWidth: 0,
    capsuleWidth: 0,
    centers: [] as number[],
    raf: 0,
    lastTime: 0,
  });

  function tabIndexFor(tab: "home" | "search" | "profile") {
    return tab === "home" ? 0 : tab === "search" ? 1 : 3;
  }

  function readNavMetrics() {
    const bar = navBarRef.current;
    const buttons = navBtnRefs.current;
    if (!bar || buttons.some((button) => !button)) return null;
    const barRect = bar.getBoundingClientRect();
    const horizontalScale = Math.max(physicsRef.current.trackX.value, 0.001);
    const centers = buttons.map((button) => {
      const rect = button!.getBoundingClientRect();
      return (rect.left + rect.width / 2 - barRect.left) / horizontalScale;
    });
    const slotWidth = centers.length > 1
      ? (centers[centers.length - 1] - centers[0]) / (centers.length - 1)
      : (barRect.width - 8) / 4;
    return { barWidth: bar.offsetWidth, barHeight: bar.offsetHeight, centers, slotWidth };
  }

  function applyPillStyle() {
    const p = physicsRef.current;
    if (!p.barWidth || p.centers.length !== 4 || !p.slotWidth) return;
    const position = Math.max(0, Math.min(3, p.position.value));
    const lowerIndex = Math.floor(position);
    const upperIndex = Math.min(3, lowerIndex + 1);
    const fraction = position - lowerIndex;
    const center = p.centers[lowerIndex] +
      (p.centers[upperIndex] - p.centers[lowerIndex]) * fraction;
    const speed = p.positionVelocity.value / 10;
    const pillScaleX = p.scaleX.value / (1 - Math.max(-0.2, Math.min(0.2, speed * 0.75)));
    const pillScaleY = p.scaleY.value * (1 - Math.max(-0.2, Math.min(0.2, speed * 0.25)));
    const pillWidth = p.capsuleWidth * pillScaleX;
    const pillHeight = (p.barHeight - 10) * pillScaleY;
    const left = center - pillWidth / 2;
    const right = p.barWidth - (center + pillWidth / 2);
    const top = (p.barHeight - pillHeight) / 2;
    const panelOffset = jellyPanelOffset(p.panel.value, p.barWidth);

    if (navBarRef.current) {
      navBarRef.current.style.transform =
        `translateX(calc(-50% + ${panelOffset}px)) translateY(${p.trackY.value}px) scaleX(${p.trackX.value}) scaleY(${p.trackPress.value})`;
      navBarRef.current.style.transformOrigin = `${p.originX}px 50%`;
    }
    if (pillRef.current) {
      pillRef.current.style.width = `${p.capsuleWidth}px`;
      pillRef.current.style.transform =
        `translateX(${center - p.capsuleWidth / 2}px) scale(${pillScaleX}, ${pillScaleY})`;
    }
    if (amberRowRef.current) {
      amberRowRef.current.style.clipPath = `inset(${top}px ${right}px ${top}px ${left}px round 9999px)`;
    }
    if (pillGlowRef.current) {
      const pillLeft = center - pillWidth / 2;
      const glowX = p.originX - pillLeft;
      const glowY = p.downY - top;
      pillGlowRef.current.style.opacity = String(p.glow.value);
      pillGlowRef.current.style.background =
        `radial-gradient(circle 150px at ${glowX}px ${glowY}px, rgba(240,168,62,0.18), transparent 72%)`;
    }
    for (let index = 0; index < 4; index++) {
      const coverage = Math.max(0, 1 - Math.abs(p.position.value - index));
      const scale = 1 + 0.2 * p.press.value * coverage;
      const transform = `scale(${scale})`;
      if (navBtnRefs.current[index]) navBtnRefs.current[index]!.style.transform = transform;
      if (navActiveItemRefs.current[index]) navActiveItemRefs.current[index]!.style.transform = transform;
    }
  }

  function stepPhysics(now: number) {
    const p = physicsRef.current;
    const dt = p.lastTime ? Math.min((now - p.lastTime) / 1000, 0.064) : 0.016;
    p.lastTime = now;
    advanceJellySpring(p.position, p.targetIndex, 1000, 1, dt);
    advanceJellySpring(p.positionVelocity, p.dragging ? p.position.velocity / 3 : 0, 300, 0.5, dt);
    if (!p.dragging) {
      advanceJellySpring(p.panel, 0, 300, 1, dt);
      advanceJellySpring(p.trackY, 0, 240 / 0.9, 18 / (2 * Math.sqrt(240 * 0.9)), dt);
      advanceJellySpring(p.trackX, 1, 240 / 0.9, 18 / (2 * Math.sqrt(240 * 0.9)), dt);
    }
    if (p.releasePending && Math.abs(p.position.value - p.targetIndex) < 3 * 0.025) {
      p.releasePending = false;
      p.pressTarget = 0;
      p.shapeTarget = 1;
      if (p.returnAfterRelease) {
        p.returnAfterRelease = false;
        p.targetIndex = tabIndexFor(activeNavTab);
      }
    }
    advanceJellySpring(p.press, p.pressTarget, 1000, 1, dt);
    advanceJellySpring(p.scaleX, p.shapeTarget, 250, 0.6, dt);
    advanceJellySpring(p.scaleY, p.shapeTarget, 250, 0.7, dt);
    advanceJellySpring(
      p.trackPress,
      p.dragging ? 1.025 : 1,
      240 / 0.9,
      18 / (2 * Math.sqrt(240 * 0.9)),
      dt,
    );
    advanceJellySpring(
      p.glow,
      p.dragging ? 1 : 0,
      240 / 0.9,
      18 / (2 * Math.sqrt(240 * 0.9)),
      dt,
    );
    applyPillStyle();
    const settled = (spring: JellySpringState, target: number) =>
      Math.abs(spring.value - target) < 0.0001 && Math.abs(spring.velocity) < 0.0001;
    const running = p.dragging || p.releasePending ||
      !settled(p.position, p.targetIndex) ||
      !settled(p.positionVelocity, 0) ||
      !settled(p.press, p.pressTarget) ||
      !settled(p.scaleX, 1) ||
      !settled(p.scaleY, 1) ||
      !settled(p.panel, 0) ||
      !settled(p.trackY, 0) ||
      !settled(p.trackX, 1) ||
      !settled(p.trackPress, 1) ||
      !settled(p.glow, 0);
    if (running) {
      p.raf = requestAnimationFrame(stepPhysics);
    } else {
      p.raf = 0;
    }
  }

  function kickPhysics() {
    if (!physicsRef.current.raf) {
      physicsRef.current.lastTime = 0;
      physicsRef.current.raf = requestAnimationFrame(stepPhysics);
    }
  }

  function readAndApplyNavMetrics() {
    const metrics = readNavMetrics();
    if (!metrics) return;
    const p = physicsRef.current;
    p.barWidth = metrics.barWidth;
    p.barHeight = metrics.barHeight;
    p.centers = metrics.centers;
    p.slotWidth = metrics.slotWidth;
    p.capsuleWidth = metrics.slotWidth;
    if (!p.dragging) {
      p.targetIndex = tabIndexFor(activeNavTab);
      p.originX = p.barWidth / 2;
    }
    applyPillStyle();
    kickPhysics();
  }

  navMetricsUpdaterRef.current = readAndApplyNavMetrics;

  useEffect(() => {
    const update = () => navMetricsUpdaterRef.current();
    update();
    const retry = window.setTimeout(update, 400);
    const bar = navBarRef.current;
    const observer = typeof ResizeObserver !== "undefined" && bar
      ? new ResizeObserver(update)
      : null;
    observer?.observe(bar!);
    window.addEventListener("resize", update);
    return () => {
      window.clearTimeout(retry);
      observer?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [activeNavTab, showNavLabels]);

  useEffect(() => () => {
    if (physicsRef.current.raf) cancelAnimationFrame(physicsRef.current.raf);
    if (profileLongPressTimerRef.current) clearTimeout(profileLongPressTimerRef.current);
    if (suppressNavClickTimerRef.current) clearTimeout(suppressNavClickTimerRef.current);
  }, []);

  function nearestIndex(clientX: number) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < 4; i++) {
      const btn = navBtnRefs.current[i];
      if (!btn) continue;
      const r = btn.getBoundingClientRect();
      const d = Math.abs(clientX - (r.left + r.width / 2));
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    return bestIdx;
  }

  function clearProfileLongPress() {
    if (profileLongPressTimerRef.current) {
      clearTimeout(profileLongPressTimerRef.current);
      profileLongPressTimerRef.current = null;
    }
  }

  function armNavClickSuppression() {
    suppressNavClickRef.current = true;
    if (suppressNavClickTimerRef.current) clearTimeout(suppressNavClickTimerRef.current);
    suppressNavClickTimerRef.current = setTimeout(() => {
      suppressNavClickRef.current = false;
      profileLongPressFiredRef.current = false;
      suppressNavClickTimerRef.current = null;
    }, 1000);
  }

  function handleNavClickCapture(e: React.MouseEvent<HTMLDivElement>) {
    if (!suppressNavClickRef.current || e.detail === 0) return;
    e.preventDefault();
    e.stopPropagation();
    suppressNavClickRef.current = false;
    profileLongPressFiredRef.current = false;
    if (suppressNavClickTimerRef.current) {
      clearTimeout(suppressNavClickTimerRef.current);
      suppressNavClickTimerRef.current = null;
    }
  }

  function activateNavIndex(index: number) {
    if (index === 0) {
      handleHomeClick();
    } else if (index === 1) {
      setShowSettings(false);
      setActiveNavTab("search");
      setSearchBarOpen(true);
    } else if (index === 2) {
      if (!uploading) {
        setShowSettings(false);
        uploadInputRef.current?.click();
      }
    } else {
      setActiveNavTab("profile");
      openSettings();
    }
  }

  function handleNavPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!e.isPrimary || e.button !== 0) return;
    const metrics = readNavMetrics();
    if (!metrics) return;
    const p = physicsRef.current;
    if (p.dragging) return;

    clearProfileLongPress();
    profileLongPressFiredRef.current = false;
    suppressNavClickRef.current = false;
    if (suppressNavClickTimerRef.current) {
      clearTimeout(suppressNavClickTimerRef.current);
      suppressNavClickTimerRef.current = null;
    }

    p.barWidth = metrics.barWidth;
    p.barHeight = metrics.barHeight;
    p.centers = metrics.centers;
    p.slotWidth = metrics.slotWidth;
    p.dragSlotWidth = metrics.slotWidth * Math.max(p.trackX.value, 0.001);
    p.capsuleWidth = metrics.slotWidth;
    p.startIndex = nearestIndex(e.clientX);
    p.pointerId = e.pointerId;
    p.startX = e.clientX;
    p.startClientY = e.clientY;
    const barRect = navBarRef.current?.getBoundingClientRect();
    p.downX = barRect
      ? (e.clientX - barRect.left) / Math.max(p.trackX.value, 0.001)
      : 0;
    p.downY = barRect
      ? (e.clientY - barRect.top) / Math.max(p.trackPress.value, 0.001)
      : 0;
    p.startY = p.trackY.value;
    p.startPanel = p.panel.value;
    p.originX = Math.max(0, Math.min(p.barWidth, p.downX));
    p.maxMoved = 0;
    p.dragging = true;
    p.targetIndex = p.startIndex;
    p.pressTarget = 1;
    p.shapeTarget = 1.3;
    p.releasePending = false;
    p.returnAfterRelease = false;
    kickPhysics();

    if (p.startIndex === 3) {
      const pointerId = e.pointerId;
      profileLongPressTimerRef.current = setTimeout(() => {
        if (physicsRef.current.pointerId === pointerId && physicsRef.current.maxMoved <= 8) {
          profileLongPressFiredRef.current = true;
          setShowProfileSwitcher(true);
        }
      }, 500);
    }

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Some browsers release the pointer before capture can be requested.
    }
  }

  function handleNavPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const p = physicsRef.current;
    if (!p.dragging || p.pointerId !== e.pointerId || !p.dragSlotWidth) return;
    const dx = e.clientX - p.startX;
    const dy = e.clientY - p.startClientY;
    p.maxMoved = Math.max(p.maxMoved, Math.abs(dx), Math.abs(dy));
    if (p.maxMoved > 8) clearProfileLongPress();

    p.targetIndex = Math.max(0, Math.min(3, p.startIndex + dx / p.dragSlotWidth));
    p.panel.value = p.startPanel + dx;
    p.panel.velocity = 0;
    p.trackY.value = p.startY + jellyRubberBand(dy, p.barHeight) * 0.25;
    p.trackY.velocity = 0;
    p.trackX.value = 1 - Math.min(Math.abs(dy) / 700, 1) * 0.08;
    p.trackX.velocity = 0;
    p.originX = Math.max(0, Math.min(p.barWidth, p.downX + dx));
    kickPhysics();
  }

  function handleNavPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const p = physicsRef.current;
    if (!p.dragging || p.pointerId !== e.pointerId) return;
    clearProfileLongPress();
    const longPress = profileLongPressFiredRef.current && p.startIndex === 3;
    const index = p.maxMoved < 4
      ? p.startIndex
      : Math.max(0, Math.min(3, Math.floor(p.targetIndex + 0.5)));

    p.dragging = false;
    p.pointerId = null;
    p.targetIndex = longPress ? tabIndexFor(activeNavTab) : index;
    p.releasePending = true;
    p.returnAfterRelease = !longPress && index === 2;
    p.pressTarget = 1;
    p.shapeTarget = 1.3;
    armNavClickSuppression();
    kickPhysics();
    if (!longPress) activateNavIndex(index);
  }

  function handleNavPointerCancel(e: React.PointerEvent<HTMLDivElement>) {
    const p = physicsRef.current;
    if (!p.dragging || p.pointerId !== e.pointerId) return;
    clearProfileLongPress();
    p.dragging = false;
    p.pointerId = null;
    p.targetIndex = tabIndexFor(activeNavTab);
    p.releasePending = true;
    p.returnAfterRelease = false;
    p.pressTarget = 1;
    p.shapeTarget = 1.3;
    profileLongPressFiredRef.current = false;
    kickPhysics();
  }

  useEffect(() => {
    if (searchBarOpen) {
      searchInputRef.current?.focus();
    }
  }, [searchBarOpen]);

  useEffect(() => {
    lastScrollYRef.current = window.scrollY;
    const lastTargetRef = { current: null as EventTarget | null };
    const lastProcessedRef = { current: 0 };
    function getScrollTop(target: EventTarget | null) {
      if (!target) return 0;
      if (target === document || target === window) return window.scrollY;
      return (target as HTMLElement).scrollTop ?? 0;
    }
    function onScroll(e: Event) {
      const now = performance.now();
      if (now - lastProcessedRef.current < 80) return;
      lastProcessedRef.current = now;
      const target = e.target;
      const y = getScrollTop(target);
      if (lastTargetRef.current !== target) {
        lastTargetRef.current = target;
        lastScrollYRef.current = y;
        return;
      }
      const delta = y - lastScrollYRef.current;
      if (delta > 6 && y > 40) {
        setShowNavLabels(false);
      } else if (delta < -6 || y < 40) {
        setShowNavLabels(true);
      }
      lastScrollYRef.current = y;
    }
    document.addEventListener("scroll", onScroll, { passive: true, capture: true });
    return () => document.removeEventListener("scroll", onScroll, { capture: true } as any);
  }, []);

  function handleHomeClick() {
    setActiveNavTab("home");
    setShowSettings(false);
    setSearchBarOpen(false);
    if (inFolder) {
      setView("root");
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function handleSearchClick() {
    setShowSettings(false);
    setActiveNavTab("search");
    setSearchBarOpen(true);
  }

  function handleUploadClick() {
    if (uploading) return;
    setShowSettings(false);
    uploadInputRef.current?.click();
  }

  function handleProfileClick() {
    if (profileLongPressFiredRef.current) return;
    setActiveNavTab("profile");
    openSettings();
  }

  function closeSearchBar() {
    setSearchBarOpen(false);
    setSearchQuery("");
    setActiveNavTab("home");
  }

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

  const fetchAllTags = useCallback(async () => {
    try {
      const res = await fetch("/api/tags");
      if (!res.ok) return;
      const data = await res.json();
      setAllTags(data.tags || []);
    } catch {
      // silently ignore; tag filter row just won't show anything new
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
    fetchAllTags();
  }, [fetchFolders, fetchAllTags]);

  // Keep biometric-enabled status current for every folder (not just
  // when Settings has been opened), so the unlock modal can show
  // "Use biometric unlock" as soon as the folder list is known.
  useEffect(() => {
    fetchBiometricStatuses();
  }, [folders]);

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

  // Cross-folder tag filter — reuses the /api/search endpoint via ?tag=
  useEffect(() => {
    if (!activeTagFilter) {
      setTagFilterResults([]);
      return;
    }
    let cancelled = false;
    setTagFilterLoading(true);
    fetch(`/api/search?tag=${encodeURIComponent(activeTagFilter)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setTagFilterResults(data.results || []);
      })
      .catch(() => {
        if (!cancelled) setTagFilterResults([]);
      })
      .finally(() => {
        if (!cancelled) setTagFilterLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTagFilter]);

  useEffect(() => {
    if (!highlightedFileKey) return;
    const el = document.querySelector(`[data-file-key="${CSS.escape(highlightedFileKey)}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightedFileKey, files]);

  function handleTagResultClick(result: SearchResult) {
    setActiveTagFilter(null);
    setTagFilterResults([]);
    if (result.folder_id) {
      const folder = folders.find((f) => f.id === result.folder_id);
      if (folder) {
        openFolder(folder);
        flashHighlight(result.file_key);
        return;
      }
    }
    setView("root");
    flashHighlight(result.file_key);
  }

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
        flashHighlight(result.file_key);
        return;
      }
    }
    setView("root");
    flashHighlight(result.file_key);
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
    if (secretKind === "login" && secretTotpSecret.trim() && !isValidBase32Secret(secretTotpSecret)) {
      setSecretError("That authenticator secret doesn't look right (should be base32 — letters A-Z and digits 2-7).");
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
              ...(secretTotpSecret.trim() ? { totpSecret: secretTotpSecret.trim().replace(/\s/g, "") } : {}),
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
      setSecretTotpSecret("");
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
    fetchBiometricStatuses();
  }

  function nativeFolderBiometricKey(scope: string) {
    return `folder-passphrase:${scope}`;
  }

  function nativeGlobalBiometricKey() {
    return "vault-pin:global";
  }

  async function fetchBiometricStatuses() {
    try {
      const protectedFolders = folders.filter((f) => f.protected);

      if (Capacitor.isNativePlatform()) {
        try {
          const stored = await SecureStorage.get(nativeGlobalBiometricKey());
          setBiometricGlobalEnabled(typeof stored === "string" && !!stored);
        } catch {
          setBiometricGlobalEnabled(false);
        }

        const results = await Promise.all(
          protectedFolders.map(async (f) => {
            try {
              const stored = await SecureStorage.get(nativeFolderBiometricKey(f.id));
              return [f.id, typeof stored === "string" && !!stored] as const;
            } catch {
              return [f.id, false] as const;
            }
          })
        );
        setBiometricFolderEnabled(Object.fromEntries(results));
        return;
      }

      const globalRes = await fetch("/api/webauthn/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "global" }),
      });
      const globalData = globalRes.ok ? await globalRes.json() : { enabled: false };
      setBiometricGlobalEnabled(!!globalData.enabled);

      const results = await Promise.all(
        protectedFolders.map(async (f) => {
          const res = await fetch("/api/webauthn/status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scope: f.id }),
          });
          const data = res.ok ? await res.json() : { enabled: false };
          return [f.id, !!data.enabled] as const;
        })
      );
      setBiometricFolderEnabled(Object.fromEntries(results));
    } catch {
      // settings panel just won't show accurate biometric state
    }
  }

  function requestBiometricToggle(scope: string, label: string, enabling: boolean) {
    setBiometricPinPrompt({ scope, label, enabling });
    setBiometricPinValue("");
    setBiometricPinError("");
  }

  async function confirmBiometricToggle() {
    if (!biometricPinPrompt) return;
    const { scope, enabling } = biometricPinPrompt;

    if (enabling && scope !== "global" && !unlockedPassphrases[scope]) {
      setBiometricPinError("Unlock this folder first, then enable biometric for it.");
      return;
    }

    setBiometricBusy(true);
    setBiometricPinError("");
    try {
      const verifyRes = await fetch("/api/auth/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: biometricPinValue }),
      });
      if (!verifyRes.ok) {
        const data = await verifyRes.json();
        throw new Error(data.error || "Incorrect PIN.");
      }

      if (!enabling) {
        if (Capacitor.isNativePlatform()) {
          try {
            await SecureStorage.remove(
              scope === "global" ? nativeGlobalBiometricKey() : nativeFolderBiometricKey(scope)
            );
          } catch {
            // key may already be gone; disabling should still succeed
          }
          if (scope === "global") setBiometricGlobalEnabled(false);
          else setBiometricFolderEnabled((prev) => ({ ...prev, [scope]: false }));
          setBiometricPinPrompt(null);
          setBiometricPinValue("");
          return;
        }

        const res = await fetch("/api/webauthn/remove", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope }),
        });
        if (!res.ok) throw new Error("Could not disable biometric.");
        if (scope === "global") setBiometricGlobalEnabled(false);
        else setBiometricFolderEnabled((prev) => ({ ...prev, [scope]: false }));
        setBiometricPinPrompt(null);
        setBiometricPinValue("");
        return;
      }

      if (Capacitor.isNativePlatform() && scope === "global") {
        try {
          await BiometricAuth.authenticate({
            reason: "Confirm your identity to enable biometric unlock for your vault",
            cancelTitle: "Cancel",
            allowDeviceCredential: true,
          });
        } catch {
          throw new Error("Biometric confirmation was cancelled or failed.");
        }
        await SecureStorage.set(nativeGlobalBiometricKey(), biometricPinValue);
        setBiometricGlobalEnabled(true);
        setBiometricPinPrompt(null);
        setBiometricPinValue("");
        return;
      }

      if (Capacitor.isNativePlatform() && scope !== "global") {
        try {
          await BiometricAuth.authenticate({
            reason: "Confirm your identity to enable biometric unlock for this folder",
            cancelTitle: "Cancel",
            allowDeviceCredential: true,
          });
        } catch {
          throw new Error("Biometric confirmation was cancelled or failed.");
        }
        await SecureStorage.set(nativeFolderBiometricKey(scope), unlockedPassphrases[scope]);
        setBiometricFolderEnabled((prev) => ({ ...prev, [scope]: true }));
        setBiometricPinPrompt(null);
        setBiometricPinValue("");
        return;
      }

      const optRes = await fetch("/api/webauthn/register-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      });
      if (!optRes.ok) throw new Error("Could not start biometric setup.");
      const options = await optRes.json();

      if (scope === "global") {
        const attestation = await startRegistration({ optionsJSON: options });
        const verifyRegRes = await fetch("/api/webauthn/register-verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope, response: attestation }),
        });
        if (!verifyRegRes.ok) throw new Error("Could not verify device.");
        setBiometricGlobalEnabled(true);
      } else {
        const prfSaltBytes = prfSaltToBytes(options.prfSalt);
        const attestation = await startRegistration({
          optionsJSON: { ...options, extensions: { prf: { eval: { first: prfSaltBytes } } } },
        });

        const prfEnabled = (attestation as any).clientExtensionResults?.prf?.enabled;
        if (!prfEnabled) {
          throw new Error("This device doesn't support the biometric extension this folder needs yet.");
        }

        const verifyRegRes = await fetch("/api/webauthn/register-verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope, response: attestation }),
        });
        if (!verifyRegRes.ok) throw new Error("Could not verify device.");

        try {
          const authOptRes = await fetch("/api/webauthn/auth-options", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scope }),
          });
          if (!authOptRes.ok) throw new Error("Could not finish biometric setup.");
          const authOptions = await authOptRes.json();
          const authPrfSaltBytes = prfSaltToBytes(authOptions.prfSalt);

          const assertion = await startAuthentication({
            optionsJSON: { ...authOptions, extensions: { prf: { eval: { first: authPrfSaltBytes } } } },
          });

          const prfSecret = normalizePrfSecret((assertion as any).clientExtensionResults?.prf?.results?.first);
          if (!prfSecret) {
            throw new Error("Couldn't retrieve the biometric key from this device.");
          }

          const { wrapped, iv } = await wrapPassphraseWithPrf(unlockedPassphrases[scope], prfSecret);

          const storeRes = await fetch("/api/webauthn/folder-secret/store", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scope, wrapped, iv }),
          });
          if (!storeRes.ok) throw new Error("Could not save the folder key.");

          setBiometricFolderEnabled((prev) => ({ ...prev, [scope]: true }));
        } catch (innerErr) {
          await fetch("/api/webauthn/remove", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scope }),
          }).catch(() => {});
          throw innerErr;
        }
      }

      setBiometricPinPrompt(null);
      setBiometricPinValue("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      setBiometricPinError(message.toLowerCase().includes("notallowed") ? "Cancelled." : message);
    } finally {
      setBiometricBusy(false);
    }
  }

  async function handleBiometricFolderUnlock() {
    if (!unlockTarget) return;
    setUnlockBiometricBusy(true);
    setUnlockError("");

    if (Capacitor.isNativePlatform()) {
      try {
        await BiometricAuth.authenticate({
          reason: "Unlock this folder",
          cancelTitle: "Cancel",
          allowDeviceCredential: true,
        });
        const stored = await SecureStorage.get(nativeFolderBiometricKey(unlockTarget.id));
        if (typeof stored !== "string" || !stored) {
          throw new Error("Biometric unlock isn't set up for this folder on this device.");
        }
        setUnlockedFolders((prev) => new Set(prev).add(unlockTarget.id));
        setUnlockedPassphrases((prev) => ({ ...prev, [unlockTarget.id]: stored }));
        setView(unlockTarget);
        setUnlockTarget(null);
        setUnlockPassphrase("");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Biometric unlock failed.";
        if (!message.toLowerCase().includes("cancel")) {
          setUnlockError(message);
        }
      } finally {
        setUnlockBiometricBusy(false);
      }
      return;
    }

    try {
      const optRes = await fetch("/api/webauthn/auth-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: unlockTarget.id }),
      });
      if (!optRes.ok) throw new Error("Biometric not available for this folder.");
      const options = await optRes.json();
      const prfSaltBytes = prfSaltToBytes(options.prfSalt);

      const assertion = await startAuthentication({
        optionsJSON: { ...options, extensions: { prf: { eval: { first: prfSaltBytes } } } },
      });

      const prfSecret = normalizePrfSecret((assertion as any).clientExtensionResults?.prf?.results?.first);
      if (!prfSecret) {
        throw new Error("This device doesn't support biometric folder unlock.");
      }

      const verifyRes = await fetch("/api/webauthn/auth-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: unlockTarget.id, response: assertion }),
      });
      if (!verifyRes.ok) throw new Error("Could not verify.");

      const secretRes = await fetch("/api/webauthn/folder-secret/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: unlockTarget.id }),
      });
      if (!secretRes.ok) throw new Error("Could not retrieve folder key.");
      const { wrapped, iv } = await secretRes.json();

      const passphrase = await unwrapPassphraseWithPrf(wrapped, iv, prfSecret);

      setUnlockedFolders((prev) => new Set(prev).add(unlockTarget.id));
      setUnlockedPassphrases((prev) => ({ ...prev, [unlockTarget.id]: passphrase }));
      setView(unlockTarget);
      setUnlockTarget(null);
      setUnlockPassphrase("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Biometric unlock failed.";
      if (!message.toLowerCase().includes("notallowed")) {
        setUnlockError(message);
      }
    } finally {
      setUnlockBiometricBusy(false);
    }
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

  // ---- Tags ----
  function openTagEditor(file: VaultFile) {
    setTagEditorFile(file);
    setTagEditorTags(file.tags ?? []);
    setTagEditorInput("");
  }

  function addTagFromInput() {
    const t = tagEditorInput.trim();
    if (!t) return;
    setTagEditorTags((prev) => (prev.includes(t) || prev.length >= 20 ? prev : [...prev, t]));
    setTagEditorInput("");
  }

  function removeTagFromEditor(tag: string) {
    setTagEditorTags((prev) => prev.filter((t) => t !== tag));
  }

  async function saveTagEdits() {
    if (!tagEditorFile) return;
    setTagEditorSaving(true);
    try {
      const res = await fetch(`/api/files/${encodeURIComponent(tagEditorFile.key)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: tagEditorTags }),
      });
      if (!res.ok) throw new Error("Failed to update tags.");
      const savedKey = tagEditorFile.key;
      const savedTags = tagEditorTags;
      setFiles((prev) => prev.map((f) => (f.key === savedKey ? { ...f, tags: savedTags } : f)));
      fetchAllTags();
      setTagEditorFile(null);
    } catch {
      setError("Failed to update tags.");
    } finally {
      setTagEditorSaving(false);
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
        paddingBottom: "calc(1.5rem + 88px + env(safe-area-inset-bottom, 0px))",
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
          <input
            type="file"
            ref={uploadInputRef}
            onChange={handleUpload}
            disabled={uploading}
            style={{ display: "none" }}
          />
        </div>

        {searchBarOpen && (
        <div style={{ position: "relative", marginBottom: "1.25rem" }}>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: "0.85rem", top: "50%", transform: "translateY(-50%)" }}>
              <SearchIcon color={COLORS.muted} />
            </span>
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search files, notes, passwords..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "0.7rem 2.4rem 0.7rem 2.4rem",
                borderRadius: "10px",
                border: `1px solid ${COLORS.border}`,
                background: COLORS.surface,
                color: COLORS.text,
                fontSize: "0.85rem",
              }}
            />
            <button
              onClick={closeSearchBar}
              aria-label="Close search"
              style={{
                position: "absolute",
                right: "0.6rem",
                top: "50%",
                transform: "translateY(-50%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "24px",
                height: "24px",
                borderRadius: "50%",
                border: "none",
                background: "none",
                cursor: "pointer",
              }}
            >
              <XIcon color={COLORS.muted} />
            </button>
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
        )}

        {!inFolder && allTags.length > 0 && (
          <div style={{ marginBottom: "1.25rem" }}>
            <div style={{ display: "flex", gap: "0.5rem", overflowX: "auto", paddingBottom: "0.25rem" }}>
              {allTags.map((tag) => {
                const active = activeTagFilter === tag;
                return (
                  <button
                    key={tag}
                    onClick={() => setActiveTagFilter(active ? null : tag)}
                    style={{
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      gap: "0.35rem",
                      padding: "0.4rem 0.75rem",
                      borderRadius: "999px",
                      border: `1px solid ${active ? COLORS.brass : COLORS.border}`,
                      background: active ? `${COLORS.brass}1F` : COLORS.surface,
                      color: active ? COLORS.brass : COLORS.text,
                      fontSize: "0.78rem",
                      fontWeight: 500,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <TagIcon color={active ? COLORS.brass : COLORS.muted} small />
                    {tag}
                  </button>
                );
              })}
            </div>
            {activeTagFilter && (
              <div
                style={{
                  marginTop: "0.5rem",
                  background: COLORS.elevated,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: "10px",
                  overflow: "hidden",
                  maxHeight: "260px",
                  overflowY: "auto",
                }}
              >
                {tagFilterLoading ? (
                  <p style={{ margin: 0, padding: "0.75rem", fontSize: "0.8rem", color: COLORS.muted }}>{"Loading\u2026"}</p>
                ) : tagFilterResults.length === 0 ? (
                  <p style={{ margin: 0, padding: "0.75rem", fontSize: "0.8rem", color: COLORS.muted }}>No files with this tag.</p>
                ) : (
                  tagFilterResults.map((r) => {
                    const folder = folders.find((f) => f.id === r.folder_id);
                    return (
                      <button
                        key={r.file_key}
                        onClick={() => handleTagResultClick(r)}
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
        )}

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

                        {secret.totpSecret && (
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "0.15rem" }}>
                            <span style={{ fontSize: "0.7rem", color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                              2FA
                            </span>
                            <TotpDisplay secret={secret.totpSecret} />
                          </div>
                        )}
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
                  <a
                    key={file.key}
                    href={src || undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      flexShrink: 0,
                      width: "84px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "0.4rem",
                      background: "none",
                      border: "none",
                      textDecoration: "none",
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
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setRowMenuFile(file);
                        }}
                        aria-label="More options"
                        style={{
                          position: "absolute",
                          top: "4px",
                          right: "4px",
                          width: "22px",
                          height: "22px",
                          borderRadius: "50%",
                          border: "none",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: "rgba(0,0,0,0.55)",
                          zIndex: 2,
                        }}
                      >
                        <MoreIcon color="#fff" />
                      </button>
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
                  </a>
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
              const isHighlighted = highlightedFileKey === file.key;

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
                    background: isSelected ? "rgba(52,199,89,0.12)" : isHighlighted ? "rgba(230,168,85,0.18)" : "transparent",
                    outline: isHighlighted ? `2px solid ${COLORS.brass}` : "none",
                    outlineOffset: "-2px",
                    transition: "background 0.3s ease, outline 0.3s ease",
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
              const isHighlighted = highlightedFileKey === file.key;

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
                    border: `2px solid ${isSelected ? COLORS.sage : isHighlighted ? COLORS.brass : COLORS.border}`,
                    transition: "border 0.3s ease",
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
                  openTagEditor(rowMenuFile);
                  setRowMenuFile(null);
                }}
                style={sheetActionStyle(COLORS.text)}
              >
                <TagIcon color={COLORS.text} />
                {rowMenuFile.tags && rowMenuFile.tags.length > 0 ? `Tags (${rowMenuFile.tags.length})` : "Add Tags"}
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

      {/* Tag editor sheet */}
      {tagEditorFile && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 }}
          onClick={() => setTagEditorFile(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: "500px", background: COLORS.elevated, borderTopLeftRadius: "20px", borderTopRightRadius: "20px", padding: "1.25rem", border: `1px solid ${COLORS.border}`, borderBottom: "none" }}
          >
            <p style={{ margin: "0 0 1rem", fontSize: "0.95rem", fontWeight: 600, color: COLORS.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {fileDisplayName(tagEditorFile)}
            </p>
            {tagEditorTags.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.75rem" }}>
                {tagEditorTags.map((tag) => (
                  <span
                    key={tag}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.35rem",
                      padding: "0.3rem 0.6rem",
                      borderRadius: "999px",
                      background: `${COLORS.brass}1F`,
                      color: COLORS.brass,
                      fontSize: "0.78rem",
                      fontWeight: 500,
                    }}
                  >
                    {tag}
                    <button
                      onClick={() => removeTagFromEditor(tag)}
                      style={{ display: "flex", background: "none", border: "none", padding: 0, cursor: "pointer" }}
                    >
                      <XIcon color={COLORS.brass} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
              <input
                type="text"
                placeholder="Add a tag..."
                value={tagEditorInput}
                onChange={(e) => setTagEditorInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTagFromInput();
                  }
                }}
                style={{
                  flex: 1,
                  boxSizing: "border-box",
                  padding: "0.6rem 0.75rem",
                  borderRadius: "10px",
                  border: `1px solid ${COLORS.border}`,
                  background: COLORS.surface,
                  color: COLORS.text,
                  fontSize: "0.85rem",
                }}
              />
              <button
                onClick={addTagFromInput}
                style={{ padding: "0 1rem", borderRadius: "10px", border: `1px solid ${COLORS.border}`, background: "none", color: COLORS.text, cursor: "pointer" }}
              >
                <CheckIcon color={COLORS.text} />
              </button>
            </div>
            {allTags.filter((t) => !tagEditorTags.includes(t) && (!tagEditorInput.trim() || t.toLowerCase().includes(tagEditorInput.trim().toLowerCase()))).length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "1rem" }}>
                {allTags
                  .filter((t) => !tagEditorTags.includes(t) && (!tagEditorInput.trim() || t.toLowerCase().includes(tagEditorInput.trim().toLowerCase())))
                  .slice(0, 8)
                  .map((tag) => (
                    <button
                      key={tag}
                      onClick={() => setTagEditorTags((prev) => (prev.length >= 20 ? prev : [...prev, tag]))}
                      style={{
                        padding: "0.3rem 0.6rem",
                        borderRadius: "999px",
                        border: `1px solid ${COLORS.border}`,
                        background: "none",
                        color: COLORS.muted,
                        fontSize: "0.75rem",
                        cursor: "pointer",
                      }}
                    >
                      {tag}
                    </button>
                  ))}
              </div>
            )}
            <button
              onClick={saveTagEdits}
              disabled={tagEditorSaving}
              style={{
                width: "100%",
                padding: "0.75rem",
                borderRadius: "10px",
                background: COLORS.brass,
                border: "none",
                color: "#000",
                fontWeight: 600,
                cursor: tagEditorSaving ? "default" : "pointer",
                opacity: tagEditorSaving ? 0.7 : 1,
              }}
            >
              {tagEditorSaving ? "Saving\u2026" : "Save"}
            </button>
            <button
              onClick={() => setTagEditorFile(null)}
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
            {biometricFolderEnabled[unlockTarget.id] && (
              <button
                onClick={handleBiometricFolderUnlock}
                disabled={unlockBiometricBusy || unlocking}
                style={{
                  width: "100%",
                  padding: "0.85rem",
                  borderRadius: "999px",
                  border: `1px solid ${COLORS.border}`,
                  background: "transparent",
                  color: COLORS.text,
                  fontWeight: 600,
                  cursor: unlockBiometricBusy || unlocking ? "not-allowed" : "pointer",
                  marginBottom: "0.9rem",
                }}
              >
                {unlockBiometricBusy ? "Waiting..." : "Use biometric unlock"}
              </button>
            )}
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

                <input
                  type="text"
                  autoComplete="off"
                  autoCapitalize="none"
                  placeholder="Authenticator secret (optional)"
                  value={secretTotpSecret}
                  onChange={(e) => setSecretTotpSecret(e.target.value)}
                  style={{ width: "100%", boxSizing: "border-box", padding: "0.75rem", borderRadius: "10px", border: `1px solid ${COLORS.border}`, background: COLORS.bg, color: COLORS.text, fontSize: "0.9rem", fontFamily: FONT_MONO, marginBottom: "0.75rem" }}
                />
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

            <button
              onClick={() => {
                setShowSettings(false);
                setShowProfileSwitcher(true);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                width: "100%",
                padding: "0.9rem 1rem",
                borderRadius: "14px",
                background: COLORS.surface,
                border: "none",
                color: COLORS.text,
                fontSize: "0.9rem",
                fontWeight: 600,
                cursor: "pointer",
                marginBottom: "1.5rem",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <PersonIcon color={COLORS.text} />
                Switch Profile
              </span>
              <span style={{ color: COLORS.muted, fontSize: "1rem" }}>{"›"}</span>
            </button>

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

            <p style={{ margin: "1.5rem 0 0.6rem", fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.06em", color: COLORS.muted, textTransform: "uppercase" }}>
              Security
            </p>

            <div style={{ borderRadius: "20px", background: COLORS.surface, overflow: "hidden", marginBottom: "1rem" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.85rem",
                  padding: "0.95rem 1.1rem",
                  borderBottom: folders.some((f) => f.protected) ? `1px solid ${COLORS.border}` : "none",
                }}
              >
                <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: COLORS.elevated, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <VaultDialIcon color={COLORS.muted} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ margin: 0, fontSize: "0.92rem", fontWeight: 500, color: COLORS.text }}>Biometric unlock</p>
                  <p style={{ margin: "0.1rem 0 0", fontSize: "0.78rem", color: COLORS.muted }}>Use fingerprint or face instead of your PIN</p>
                </div>
                <button
                  onClick={() => requestBiometricToggle("global", "vault PIN", !biometricGlobalEnabled)}
                  disabled={biometricGlobalEnabled === null}
                  style={{
                    width: "46px",
                    height: "26px",
                    borderRadius: "999px",
                    border: "none",
                    background: biometricGlobalEnabled ? COLORS.sage : COLORS.elevated,
                    position: "relative",
                    cursor: "pointer",
                    flexShrink: 0,
                    opacity: biometricGlobalEnabled === null ? 0.5 : 1,
                  }}
                  aria-label="Toggle biometric unlock for vault PIN"
                >
                  <div style={{ position: "absolute", top: "3px", left: biometricGlobalEnabled ? "23px" : "3px", width: "20px", height: "20px", borderRadius: "50%", background: "#fff", transition: "left 0.15s ease" }} />
                </button>
              </div>

              {folders.filter((f) => f.protected).map((f, i, arr) => (
                <div
                  key={f.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.85rem",
                    padding: "0.95rem 1.1rem",
                    borderBottom: i < arr.length - 1 ? `1px solid ${COLORS.border}` : "none",
                  }}
                >
                  <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: `${COLORS.brass}1F`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <KeyholeIcon unlocked={false} color={COLORS.brass} />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ margin: 0, fontSize: "0.92rem", fontWeight: 500, color: COLORS.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {f.name}
                    </p>
                    <p style={{ margin: "0.1rem 0 0", fontSize: "0.78rem", color: COLORS.muted }}>
                      {unlockedPassphrases[f.id] ? "Biometric for this folder" : "Unlock this folder first to enable"}
                    </p>
                  </div>
                  <button
                    onClick={() => requestBiometricToggle(f.id, f.name, !biometricFolderEnabled[f.id])}
                    disabled={!biometricFolderEnabled[f.id] && !unlockedPassphrases[f.id]}
                    style={{
                      width: "46px",
                      height: "26px",
                      borderRadius: "999px",
                      border: "none",
                      background: biometricFolderEnabled[f.id] ? COLORS.sage : COLORS.elevated,
                      position: "relative",
                      cursor: !biometricFolderEnabled[f.id] && !unlockedPassphrases[f.id] ? "not-allowed" : "pointer",
                      flexShrink: 0,
                      opacity: !biometricFolderEnabled[f.id] && !unlockedPassphrases[f.id] ? 0.5 : 1,
                    }}
                    aria-label={`Toggle biometric unlock for ${f.name}`}
                  >
                    <div style={{ position: "absolute", top: "3px", left: biometricFolderEnabled[f.id] ? "23px" : "3px", width: "20px", height: "20px", borderRadius: "50%", background: "#fff", transition: "left 0.15s ease" }} />
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={() => setShowSettings(false)}
              style={{ width: "100%", padding: "0.85rem", borderRadius: "999px", background: COLORS.surface, border: "none", color: COLORS.text, fontWeight: 600, cursor: "pointer", marginTop: "0.5rem" }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Biometric PIN confirm modal */}
      {biometricPinPrompt && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 60 }}
          onClick={() => (biometricBusy ? null : setBiometricPinPrompt(null))}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: "500px", background: COLORS.elevated, borderTopLeftRadius: "20px", borderTopRightRadius: "20px", padding: "1.5rem", border: `1px solid ${COLORS.brass}55`, borderBottom: "none" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "1rem" }}>
              <VaultDialIcon color={COLORS.brass} />
              <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 600 }}>
                {biometricPinPrompt.enabling ? "Enable" : "Disable"} biometric for {biometricPinPrompt.label}
              </h2>
            </div>
            <p style={{ margin: "0 0 0.75rem", fontSize: "0.82rem", color: COLORS.muted }}>
              Enter your PIN to confirm this change.
            </p>
            <input
              type="password"
              autoComplete="off"
              placeholder="Enter PIN"
              value={biometricPinValue}
              onChange={(e) => setBiometricPinValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirmBiometricToggle()}
              autoFocus
              style={{ width: "100%", boxSizing: "border-box", padding: "0.75rem", borderRadius: "10px", border: `1px solid ${COLORS.border}`, background: COLORS.bg, color: COLORS.text, fontSize: "0.9rem", marginBottom: "0.75rem" }}
            />
            {biometricPinError && <p style={{ color: COLORS.danger, fontSize: "0.8rem" }}>{biometricPinError}</p>}
            <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.75rem" }}>
              <button
                onClick={() => setBiometricPinPrompt(null)}
                disabled={biometricBusy}
                style={{ flex: 1, padding: "0.75rem", borderRadius: "10px", background: "none", border: `1px solid ${COLORS.border}`, color: COLORS.text, cursor: biometricBusy ? "not-allowed" : "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={confirmBiometricToggle}
                disabled={biometricBusy || !biometricPinValue}
                style={{ flex: 1, padding: "0.75rem", borderRadius: "10px", background: COLORS.brass, color: "#000", border: "none", fontWeight: 600, cursor: biometricBusy || !biometricPinValue ? "not-allowed" : "pointer", opacity: biometricBusy || !biometricPinValue ? 0.6 : 1 }}
              >
                {biometricBusy ? "Confirming..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom navigation bar -- floating pill, Nuvio-style jelly physics + masked color reveal */}
      <div
        ref={navBarRef}
        role="navigation"
        aria-label="Primary navigation"
        onClickCapture={handleNavClickCapture}
        onPointerDown={handleNavPointerDown}
        onPointerMove={handleNavPointerMove}
        onPointerUp={handleNavPointerUp}
        onPointerCancel={handleNavPointerCancel}
        onContextMenu={(event) => event.preventDefault()}
        style={{
          position: "fixed",
          left: "50%",
          transform: "translateX(-50%)",
          bottom: "calc(14px + env(safe-area-inset-bottom, 0px))",
          zIndex: 55,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-around",
          width: showNavLabels ? "min(calc(100vw - 56px), 400px)" : "204px",
          height: showNavLabels ? "72px" : "52px",
          padding: "0 0.4rem",
          borderRadius: "9999px",
          background: "rgba(28,28,30,0.68)",
          backdropFilter: "blur(24px) saturate(145%)",
          WebkitBackdropFilter: "blur(24px) saturate(145%)",
          border: "1px solid rgba(255,255,255,0.24)",
          boxShadow: "0 8px 28px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.18)",
          transition: "width 0.35s cubic-bezier(0.4,0,0.2,1), height 0.35s cubic-bezier(0.4,0,0.2,1)",
          overflow: "hidden",
          boxSizing: "border-box",
          touchAction: "none",
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
      >
        {/* jelly pill track -- physics-driven, sits behind both label layers */}
        <div
          ref={pillRef}
          style={{
            position: "absolute",
            top: "5px",
            bottom: "5px",
            left: 0,
            width: "80px",
            borderRadius: "9999px",
            background: "rgba(255,255,255,0.17)",
            border: "1px solid rgba(255,255,255,0.10)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.16)",
            overflow: "hidden",
            boxSizing: "border-box",
            pointerEvents: "none",
            zIndex: 1,
            willChange: "transform, width",
            transformOrigin: "center center",
          }}
        >
          <div
            ref={pillGlowRef}
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              opacity: 0,
              pointerEvents: "none",
              willChange: "opacity, background",
            }}
          />
        </div>

        {/* layer 1: muted row -- always visible, real interactive buttons */}
        <div style={{ position: "relative", zIndex: 2, display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "space-around" }}>
          <button
            onClick={handleHomeClick}
            ref={(el) => { navBtnRefs.current[0] = el; }}
            type="button"
            aria-label="Home"
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              gap: "0.05rem", flex: 1, height: "calc(100% - 10px)", padding: 0,
              borderRadius: "9999px", border: "none", background: "none", cursor: "pointer",
              WebkitTapHighlightColor: "transparent", transformOrigin: "center center", willChange: "transform",
            }}
          >
            <HomeIcon color={COLORS.muted} size={32} filled={false} />
            <span style={{ fontSize: "1rem", fontWeight: 500, color: COLORS.muted, maxHeight: showNavLabels ? "22px" : "0px", opacity: showNavLabels ? 1 : 0, overflow: "hidden", transition: "max-height 0.3s cubic-bezier(0.4,0,0.2,1), opacity 0.2s ease" }}>
              Home
            </span>
          </button>

          <button
            onClick={handleSearchClick}
            ref={(el) => { navBtnRefs.current[1] = el; }}
            type="button"
            aria-label="Search"
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              gap: "0.05rem", flex: 1, height: "calc(100% - 10px)", padding: 0,
              borderRadius: "9999px", border: "none", background: "none", cursor: "pointer",
              WebkitTapHighlightColor: "transparent", transformOrigin: "center center", willChange: "transform",
            }}
          >
            <SearchIcon color={COLORS.muted} size={32} strokeWidth={2.1} />
            <span style={{ fontSize: "1rem", fontWeight: 500, color: COLORS.muted, maxHeight: showNavLabels ? "22px" : "0px", opacity: showNavLabels ? 1 : 0, overflow: "hidden", transition: "max-height 0.3s cubic-bezier(0.4,0,0.2,1), opacity 0.2s ease" }}>
              Search
            </span>
          </button>

          <button
            onClick={handleUploadClick}
            disabled={uploading}
            ref={(el) => { navBtnRefs.current[2] = el; }}
            type="button"
            aria-label="Upload"
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              gap: "0.05rem", flex: 1, height: "calc(100% - 10px)", padding: 0,
              borderRadius: "9999px", border: "none", background: "none",
              cursor: uploading ? "not-allowed" : "pointer", opacity: uploading ? 0.5 : 1,
              WebkitTapHighlightColor: "transparent", transformOrigin: "center center", willChange: "transform",
            }}
          >
            <UploadIcon color={COLORS.muted} size={32} />
            <span style={{ fontSize: "1rem", fontWeight: 500, color: COLORS.muted, maxHeight: showNavLabels ? "22px" : "0px", opacity: showNavLabels ? 1 : 0, overflow: "hidden", transition: "max-height 0.3s cubic-bezier(0.4,0,0.2,1), opacity 0.2s ease" }}>
              {uploading ? "Uploading" : "Upload"}
            </span>
          </button>

          <button
            onClick={handleProfileClick}
            ref={(el) => { navBtnRefs.current[3] = el; }}
            type="button"
            aria-label="Profile"
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              gap: "0.05rem", flex: 1, height: "calc(100% - 10px)", padding: 0,
              borderRadius: "9999px", border: "none", background: "none", cursor: "pointer",
              WebkitTapHighlightColor: "transparent", transformOrigin: "center center", willChange: "transform",
            }}
          >
            <PersonIcon color={COLORS.muted} size={32} strokeWidth={2.1} />
            <span style={{ fontSize: "1rem", fontWeight: 500, color: COLORS.muted, maxHeight: showNavLabels ? "22px" : "0px", opacity: showNavLabels ? 1 : 0, overflow: "hidden", transition: "max-height 0.3s cubic-bezier(0.4,0,0.2,1), opacity 0.2s ease" }}>
              Profile
            </span>
          </button>
        </div>

        {/* amber row -- clipped to the live pill, same p.x/p.width as the pill itself so it can't drift out of sync */}
        <div
          ref={amberRowRef}
          style={{
            position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
            display: "flex", alignItems: "center", justifyContent: "space-around",
            padding: "0 0.4rem", boxSizing: "border-box",
            pointerEvents: "none", zIndex: 3,
            clipPath: "inset(0 100% 0 0 round 9999px)",
          }}
        >
          <div ref={(el) => { navActiveItemRefs.current[0] = el; }} aria-hidden="true" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "0.05rem", flex: 1, height: "100%", transformOrigin: "center center", willChange: "transform" }}>
            <HomeIcon color="#fff" size={32} filled={true} />
            <span style={{ fontSize: "1rem", fontWeight: 700, color: "#fff", maxHeight: showNavLabels ? "22px" : "0px", opacity: showNavLabels ? 1 : 0, overflow: "hidden" }}>Home</span>
          </div>
          <div ref={(el) => { navActiveItemRefs.current[1] = el; }} aria-hidden="true" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "0.05rem", flex: 1, height: "100%", transformOrigin: "center center", willChange: "transform" }}>
            <SearchIcon color="#fff" size={32} strokeWidth={2.6} />
            <span style={{ fontSize: "1rem", fontWeight: 700, color: "#fff", maxHeight: showNavLabels ? "22px" : "0px", opacity: showNavLabels ? 1 : 0, overflow: "hidden" }}>Search</span>
          </div>
          <div ref={(el) => { navActiveItemRefs.current[2] = el; }} aria-hidden="true" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "0.05rem", flex: 1, height: "100%", transformOrigin: "center center", willChange: "transform" }}>
            <UploadIcon color="#fff" size={32} />
            <span style={{ fontSize: "1rem", fontWeight: 700, color: "#fff", maxHeight: showNavLabels ? "22px" : "0px", opacity: showNavLabels ? 1 : 0, overflow: "hidden" }}>{uploading ? "Uploading" : "Upload"}</span>
          </div>
          <div ref={(el) => { navActiveItemRefs.current[3] = el; }} aria-hidden="true" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "0.05rem", flex: 1, height: "100%", transformOrigin: "center center", willChange: "transform" }}>
            <PersonIcon color="#fff" size={32} strokeWidth={2.6} />
            <span style={{ fontSize: "1rem", fontWeight: 700, color: "#fff", maxHeight: showNavLabels ? "22px" : "0px", opacity: showNavLabels ? 1 : 0, overflow: "hidden" }}>Profile</span>
          </div>
        </div>
      </div>

      {/* Profile switcher overlay -- placeholder, replaced by the full avatar grid next */}
      {showProfileSwitcher && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 70 }}
          onClick={() => setShowProfileSwitcher(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: COLORS.elevated, borderRadius: "20px", padding: "2rem", maxWidth: "320px", textAlign: "center", border: `1px solid ${COLORS.border}` }}
          >
            <p style={{ margin: "0 0 1rem", fontSize: "0.95rem", color: COLORS.text }}>
              Profile switcher coming soon.
            </p>
            <button
              onClick={() => setShowProfileSwitcher(false)}
              style={{ padding: "0.6rem 1.4rem", borderRadius: "999px", background: COLORS.brass, border: "none", color: "#1A1305", fontWeight: 600, cursor: "pointer" }}
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