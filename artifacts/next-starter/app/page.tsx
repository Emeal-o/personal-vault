"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
        return;
      }

      router.push("/dashboard");
    } catch {
      setError("Network error. Try again.");
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        alignItems: "center",
        justifyContent: "center",
        background:
          "radial-gradient(circle at 50% 0%, #1a1a2e 0%, #0a0a0f 60%)",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        padding: "1.5rem",
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "1.5rem",
          width: "100%",
          maxWidth: "360px",
          padding: "2.5rem 2rem",
          borderRadius: "20px",
          background: "rgba(255, 255, 255, 0.03)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.5)",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize: "2.5rem",
              marginBottom: "0.5rem",
              lineHeight: 1,
            }}
          >
            🔒
          </div>
          <h1
            style={{
              color: "#fff",
              fontSize: "1.35rem",
              fontWeight: 600,
              margin: 0,
              letterSpacing: "-0.02em",
            }}
          >
            Personal Vault
          </h1>
          <p
            style={{
              color: "rgba(255, 255, 255, 0.4)",
              fontSize: "0.875rem",
              marginTop: "0.35rem",
            }}
          >
            Enter your PIN to continue
          </p>
        </div>

        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          placeholder="••••••••"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          autoFocus
          style={{
            padding: "1rem",
            fontSize: "1.5rem",
            textAlign: "center",
            letterSpacing: "0.4em",
            borderRadius: "12px",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            background: "rgba(255, 255, 255, 0.04)",
            color: "#fff",
            outline: "none",
            transition: "border-color 0.2s ease",
          }}
          onFocus={(e) =>
            (e.target.style.borderColor = "rgba(255, 255, 255, 0.3)")
          }
          onBlur={(e) =>
            (e.target.style.borderColor = "rgba(255, 255, 255, 0.1)")
          }
        />

        {error && (
          <p
            style={{
              color: "#ff6b6b",
              textAlign: "center",
              margin: 0,
              fontSize: "0.875rem",
            }}
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || !pin}
          style={{
            padding: "0.9rem",
            fontSize: "1rem",
            borderRadius: "12px",
            border: "none",
            background:
              loading || !pin ? "rgba(255,255,255,0.1)" : "#fff",
            color: loading || !pin ? "rgba(255,255,255,0.4)" : "#000",
            fontWeight: 600,
            cursor: loading || !pin ? "not-allowed" : "pointer",
            transition: "opacity 0.2s ease, transform 0.1s ease",
          }}
        >
          {loading ? "Verifying..." : "Unlock"}
        </button>
      </form>
    </div>
  );
}