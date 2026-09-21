"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { startAuthentication } from "@simplewebauthn/browser";
import { Capacitor } from "@capacitor/core";
import { BiometricAuth } from "@aparajita/capacitor-biometric-auth";
import { SecureStorage } from "@aparajita/capacitor-secure-storage";

function nativeGlobalBiometricKey() {
  return "vault-pin:global";
}

const COLORS = {
  bg: "#000000",
  surface: "#161618",
  elevated: "#1E1E21",
  text: "#F5F5F5",
  muted: "#8E8E93",
  brass: "#F0A83E",
  danger: "#FF453A",
};

const MAX_PIN_LENGTH = 12;
const DOT_SLOTS = 4;

function LockIcon({ color }: { color: string }) {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
      <path d="M7 10V7a5 5 0 0 1 10 0v3" stroke={color} strokeWidth="1.8" strokeLinecap="round" fill="none" />
      <rect x="5" y="10" width="14" height="10" rx="2" stroke={color} strokeWidth="1.8" fill="none" />
      <circle cx="12" cy="14.5" r="1.4" fill={color} />
      <path d="M12 15.8V17.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function BackspaceIcon({ color }: { color: string }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path
        d="M9 6h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-6-6 6-6Z"
        stroke={color}
        strokeWidth="1.7"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M12 10.5 16.5 15M16.5 10.5 12 15" stroke={color} strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function FingerprintIcon({ color }: { color: string }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3a7 7 0 0 0-7 7v2c0 2.5-.5 4.5-1.5 6M12 3a7 7 0 0 1 7 7v1M12 6.5A5.5 5.5 0 0 0 6.5 12v1c0 2-.3 3.6-1 5M12 6.5A5.5 5.5 0 0 1 17.5 12v2c0 1 0 2 .3 3M9 12v.5c0 3-1 5.5-2.5 7.5M12 10a2 2 0 0 1 2 2v1c0 3 .5 5 1.5 7"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export default function LoginPage() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      SecureStorage.get(nativeGlobalBiometricKey())
        .then((stored) => setBiometricAvailable(typeof stored === "string" && !!stored))
        .catch(() => setBiometricAvailable(false));
      return;
    }
    if (typeof window === "undefined" || !window.PublicKeyCredential) return;
    fetch("/api/webauthn/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "global" }),
    })
      .then((res) => (res.ok ? res.json() : { enabled: false }))
      .then((data) => setBiometricAvailable(!!data.enabled))
      .catch(() => setBiometricAvailable(false));
  }, []);

  async function handleSubmit() {
    if (!pin || loading) return;
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        setLoading(false);
        setPin("");
        return;
      }

      router.push("/dashboard");
    } catch (err) {
      setError(`Debug: ${err instanceof Error ? err.message : String(err)}`);
      setLoading(false);
    }
  }

  async function handleBiometricUnlock() {
    if (biometricLoading || loading) return;
    setError("");
    setBiometricLoading(true);

    if (Capacitor.isNativePlatform()) {
      try {
        await BiometricAuth.authenticate({
          reason: "Unlock your vault",
          cancelTitle: "Cancel",
          allowDeviceCredential: true,
        });
        const stored = await SecureStorage.get(nativeGlobalBiometricKey());
        if (typeof stored !== "string" || !stored) {
          throw new Error("Biometric unlock isn't set up on this device.");
        }
        const res = await fetch("/api/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pin: stored }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Could not unlock.");
        }
        router.push("/dashboard");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!message.toLowerCase().includes("cancel")) {
          setError(message);
        }
        setBiometricLoading(false);
      }
      return;
    }

    try {
      const optRes = await fetch("/api/webauthn/auth-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "global" }),
      });
      if (!optRes.ok) {
        throw new Error("Biometric unlock isn't available right now.");
      }
      const options = await optRes.json();

      const assertion = await startAuthentication({ optionsJSON: options });

      const verifyRes = await fetch("/api/webauthn/auth-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "global", response: assertion }),
      });

      if (!verifyRes.ok) {
        const data = await verifyRes.json();
        throw new Error(data.error || "Could not verify.");
      }

      router.push("/dashboard");
    } catch (err) {
      // A cancelled/failed OS biometric prompt throws NotAllowedError —
      // treat that quietly rather than as a scary error.
      const message = err instanceof Error ? err.message : String(err);
      if (!message.toLowerCase().includes("notallowed")) {
        setError(message);
      }
      setBiometricLoading(false);
    }
  }

  function pressDigit(digit: string) {
    if (loading) return;
    setError("");
    setPin((prev) => (prev.length < MAX_PIN_LENGTH ? prev + digit : prev));
  }

  function pressBackspace() {
    if (loading) return;
    setError("");
    setPin((prev) => prev.slice(0, -1));
  }

  const keypadRows: (string | null)[][] = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    [null, "0", "backspace"],
  ];

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: COLORS.bg,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        padding: "1.5rem",
      }}
    >
      <div style={{ width: "100%", maxWidth: "360px", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div
            style={{
              width: "58px",
              height: "58px",
              borderRadius: "16px",
              background: `${COLORS.brass}1F`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 1rem",
            }}
          >
            <LockIcon color={COLORS.brass} />
          </div>
          <h1
            style={{
              color: COLORS.text,
              fontSize: "1.5rem",
              fontWeight: 700,
              margin: 0,
              letterSpacing: "-0.02em",
            }}
          >
            Personal Vault
          </h1>
          <p
            style={{
              color: COLORS.muted,
              fontSize: "0.9rem",
              marginTop: "0.4rem",
            }}
          >
            Enter your PIN to continue
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.9rem", marginBottom: "2.25rem", minHeight: "18px", alignItems: "center" }}>
          {Array.from({ length: Math.max(DOT_SLOTS, pin.length) }).map((_, i) => {
            const filled = i < pin.length;
            return (
              <div
                key={i}
                style={{
                  width: i < DOT_SLOTS ? "14px" : "10px",
                  height: i < DOT_SLOTS ? "14px" : "10px",
                  borderRadius: "50%",
                  background: filled ? COLORS.brass : "transparent",
                  border: `1.5px solid ${filled ? COLORS.brass : COLORS.muted}`,
                  transition: "background 0.15s ease",
                }}
              />
            );
          })}
        </div>

        {error && (
          <p
            style={{
              color: COLORS.danger,
              textAlign: "center",
              margin: "0 0 1rem",
              fontSize: "0.875rem",
            }}
          >
            {error}
          </p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
          {keypadRows.map((row, rowIdx) => (
            <div key={rowIdx} style={{ display: "flex", gap: "1.1rem" }}>
              {row.map((key, colIdx) => {
                if (key === null) {
                  return <div key={colIdx} style={{ width: "72px", height: "72px" }} />;
                }
                if (key === "backspace") {
                  return (
                    <button
                      key={colIdx}
                      onClick={pressBackspace}
                      aria-label="Backspace"
                      disabled={loading}
                      style={{
                        width: "72px",
                        height: "72px",
                        borderRadius: "50%",
                        border: "none",
                        background: "transparent",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: loading ? "not-allowed" : "pointer",
                      }}
                    >
                      <BackspaceIcon color={COLORS.muted} />
                    </button>
                  );
                }
                return (
                  <button
                    key={colIdx}
                    onClick={() => pressDigit(key)}
                    disabled={loading}
                    style={{
                      width: "72px",
                      height: "72px",
                      borderRadius: "50%",
                      border: "none",
                      background: COLORS.elevated,
                      color: COLORS.text,
                      fontSize: "1.6rem",
                      fontWeight: 500,
                      cursor: loading ? "not-allowed" : "pointer",
                      opacity: loading ? 0.5 : 1,
                    }}
                  >
                    {key}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <button
          onClick={handleSubmit}
          disabled={loading || !pin}
          style={{
            marginTop: "2rem",
            width: "100%",
            padding: "0.9rem",
            fontSize: "1rem",
            borderRadius: "999px",
            border: "none",
            background: loading || !pin ? COLORS.elevated : COLORS.brass,
            color: loading || !pin ? COLORS.muted : "#1A1305",
            fontWeight: 700,
            cursor: loading || !pin ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Verifying..." : "Unlock"}
        </button>

        {biometricAvailable && (
          <button
            onClick={handleBiometricUnlock}
            disabled={biometricLoading || loading}
            style={{
              marginTop: "0.9rem",
              width: "100%",
              padding: "0.85rem",
              fontSize: "0.95rem",
              borderRadius: "999px",
              border: `1px solid ${COLORS.elevated}`,
              background: "transparent",
              color: biometricLoading ? COLORS.muted : COLORS.text,
              fontWeight: 600,
              cursor: biometricLoading || loading ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.6rem",
            }}
          >
            <FingerprintIcon color={biometricLoading ? COLORS.muted : COLORS.brass} />
            {biometricLoading ? "Waiting..." : "Use biometric unlock"}
          </button>
        )}
      </div>
    </div>
  );
}
