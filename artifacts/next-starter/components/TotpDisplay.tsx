"use client";

import { useEffect, useRef, useState } from "react";
import { generateTotp } from "@/lib/totp";

const PERIOD = 30;
const SIZE = 40;
const STROKE = 3;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function TotpDisplay({ secret }: { secret: string }) {
  const [code, setCode] = useState("------");
  const [secondsRemaining, setSecondsRemaining] = useState(PERIOD);
  const [copied, setCopied] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      try {
        const result = await generateTotp(secret);
        if (cancelled) return;
        setCode(result.code);
        setSecondsRemaining(result.secondsRemaining);
      } catch {
        if (!cancelled) setCode("ERROR");
      }
    }

    tick();
    // Tick every second so the countdown ring actually animates, instead of
    // only recomputing once per 30s window.
    intervalRef.current = setInterval(tick, 1000);

    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [secret]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard unavailable — code is still visible on screen, so fail silently.
    }
  }

  const progress = secondsRemaining / PERIOD;
  const dashOffset = CIRCUMFERENCE * (1 - progress);
  const ringColor = secondsRemaining <= 5 ? "#FF453A" : "#F0A83E";

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label="Copy TOTP code"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: "transparent",
        border: "none",
        padding: 0,
        cursor: "pointer",
      }}
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={STROKE}
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={ringColor}
          strokeWidth={STROKE}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          style={{ transition: "stroke-dashoffset 1s linear, stroke 0.3s" }}
        />
      </svg>
      <span
        style={{
          fontFamily: "monospace",
          fontSize: 18,
          letterSpacing: 2,
          color: copied ? "#34C759" : "#F5F5F5",
        }}
      >
        {copied ? "Copied" : code.replace(/(\d{3})(\d{3})/, "$1 $2")}
      </span>
    </button>
  );
}
