"use client";

import { cn } from "@server/lib/utils";

interface LogoProps {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  variant?: "full" | "icon";
  animated?: boolean;
}

const sizes = {
  sm: { icon: 34, text: "text-base", gap: "gap-2" },
  md: { icon: 42, text: "text-xl", gap: "gap-2.5" },
  lg: { icon: 56, text: "text-2xl", gap: "gap-3" },
  xl: { icon: 80, text: "text-4xl", gap: "gap-4" },
};

// CSS animations injected once globally
const STYLE = `
@keyframes logo-spin   { to { transform: rotate(360deg); } }
@keyframes logo-spin-r { to { transform: rotate(-360deg); } }
@keyframes logo-pulse  { 0%,100%{opacity:.25} 50%{opacity:.7} }
@keyframes logo-aurora {
  0%   { stop-color:#3B82F6 }
  25%  { stop-color:#8B5CF6 }
  50%  { stop-color:#06B6D4 }
  75%  { stop-color:#6366F1 }
  100% { stop-color:#3B82F6 }
}
@keyframes logo-aurora2 {
  0%   { stop-color:#7C3AED }
  25%  { stop-color:#0EA5E9 }
  50%  { stop-color:#A855F7 }
  75%  { stop-color:#2563EB }
  100% { stop-color:#7C3AED }
}
@keyframes logo-float  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-3px)} }
@keyframes logo-orbit1 {
  from { transform: rotate(0deg)   translateX(28px) rotate(0deg); }
  to   { transform: rotate(360deg) translateX(28px) rotate(-360deg); }
}
@keyframes logo-orbit2 {
  from { transform: rotate(120deg)  translateX(22px) rotate(-120deg); }
  to   { transform: rotate(480deg)  translateX(22px) rotate(-480deg); }
}
@keyframes logo-orbit3 {
  from { transform: rotate(240deg)  translateX(34px) rotate(-240deg); }
  to   { transform: rotate(600deg)  translateX(34px) rotate(-600deg); }
}
@keyframes logo-shine {
  0%   { stroke-dashoffset: 300; opacity: 0; }
  10%  { opacity: 1; }
  60%  { opacity: 1; }
  100% { stroke-dashoffset: 0;   opacity: 0; }
}
@keyframes logo-bg-shift {
  0%,100% { transform: rotate(0deg)   scale(1); }
  33%     { transform: rotate(120deg) scale(1.08); }
  66%     { transform: rotate(240deg) scale(0.96); }
}
`;

let styleInjected = false;

function injectStyle() {
  if (typeof document === "undefined" || styleInjected) return;
  styleInjected = true;
  const el = document.createElement("style");
  el.textContent = STYLE;
  document.head.appendChild(el);
}

export function Logo({ className, size = "md", variant = "full", animated = true }: LogoProps) {
  if (animated && typeof window !== "undefined") injectStyle();

  const { icon, text, gap } = sizes[size];
  const uid = `lg-${size}`;

  return (
    <div className={cn("flex items-center", gap, className)}>
      {/* ── Icon ── */}
      <svg
        width={icon}
        height={icon}
        viewBox="0 0 80 80"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ overflow: "visible", flexShrink: 0 }}
        aria-hidden="true"
      >
        <defs>
          {/* Aurora gradient — animates colors */}
          <radialGradient id={`${uid}-bg`} cx="50%" cy="45%" r="60%">
            <stop offset="0%"   stopColor="#60A5FA">
              {animated && <animate attributeName="stop-color"
                values="#60A5FA;#A78BFA;#22D3EE;#818CF8;#60A5FA"
                dur="6s" repeatCount="indefinite" />}
            </stop>
            <stop offset="60%"  stopColor="#2563EB">
              {animated && <animate attributeName="stop-color"
                values="#2563EB;#7C3AED;#0891B2;#4F46E5;#2563EB"
                dur="6s" repeatCount="indefinite" />}
            </stop>
            <stop offset="100%" stopColor="#1E1B4B">
              {animated && <animate attributeName="stop-color"
                values="#1E1B4B;#2E1065;#0C4A6E;#1E1B4B;#1E1B4B"
                dur="6s" repeatCount="indefinite" />}
            </stop>
          </radialGradient>

          {/* Outer ring gradient */}
          <linearGradient id={`${uid}-ring`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor="#93C5FD" stopOpacity="0.9" />
            <stop offset="50%"  stopColor="#C4B5FD" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#67E8F9" stopOpacity="0.9" />
          </linearGradient>

          {/* Glow filter */}
          <filter id={`${uid}-glow`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>

          {/* Strong glow for particles */}
          <filter id={`${uid}-pglow`} x="-200%" y="-200%" width="500%" height="500%">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>

          {/* Clip for rounded square */}
          <clipPath id={`${uid}-clip`}>
            <rect x="6" y="6" width="68" height="68" rx="18" />
          </clipPath>
        </defs>

        {/* ── Outer glow halo ── */}
        {animated && (
          <ellipse cx="40" cy="40" rx="38" ry="38" fill="none" stroke="#3B82F6" strokeWidth="1.5" strokeOpacity="0.2">
            <animate attributeName="rx" values="36;40;36" dur="3s" repeatCount="indefinite" />
            <animate attributeName="ry" values="36;40;36" dur="3s" repeatCount="indefinite" />
            <animate attributeName="stroke-opacity" values="0.2;0.05;0.2" dur="3s" repeatCount="indefinite" />
          </ellipse>
        )}

        {/* ── Background shape ── */}
        <g clipPath={`url(#${uid}-clip)`}>
          {/* Deep space base */}
          <rect x="6" y="6" width="68" height="68" rx="18" fill="#0F0A2A" />

          {/* Aurora layer — slowly shifting blob */}
          {animated ? (
            <ellipse cx="40" cy="38" rx="36" ry="32" fill={`url(#${uid}-bg)`} opacity="0.9"
              style={{ transformOrigin: "40px 38px", animation: "logo-bg-shift 8s ease-in-out infinite" }} />
          ) : (
            <ellipse cx="40" cy="38" rx="36" ry="32" fill={`url(#${uid}-bg)`} opacity="0.9" />
          )}

          {/* Nebula detail — top light streak */}
          <ellipse cx="30" cy="20" rx="18" ry="8" fill="#60A5FA" opacity="0.15" transform="rotate(-20 30 20)" />
          <ellipse cx="52" cy="54" rx="14" ry="6" fill="#A78BFA" opacity="0.12" transform="rotate(15 52 54)" />

          {/* Star field */}
          {[
            [15,18,1.2],[58,14,0.8],[22,60,1],[62,58,0.9],
            [48,22,0.7],[18,42,0.6],[64,36,1.1],[36,62,0.8],
          ].map(([x,y,r],i) => (
            <circle key={i} cx={x} cy={y} r={r} fill="white">
              {animated && (
                <animate attributeName="opacity"
                  values="0.9;0.2;0.9"
                  dur={`${1.5 + i * 0.4}s`}
                  repeatCount="indefinite"
                  begin={`${i * 0.3}s`} />
              )}
            </circle>
          ))}
        </g>

        {/* ── Rotating outer ring (dashed) ── */}
        {animated ? (
          <circle cx="40" cy="40" r="36" fill="none"
            stroke={`url(#${uid}-ring)`} strokeWidth="1.2"
            strokeDasharray="8 4 3 4 18 4"
            style={{ transformOrigin: "40px 40px", animation: "logo-spin 10s linear infinite" }} />
        ) : (
          <circle cx="40" cy="40" r="36" fill="none"
            stroke={`url(#${uid}-ring)`} strokeWidth="1.2"
            strokeDasharray="8 4 3 4 18 4" />
        )}

        {/* ── Counter-rotating inner ring ── */}
        {animated ? (
          <circle cx="40" cy="40" r="29" fill="none"
            stroke="#818CF8" strokeWidth="0.8" strokeOpacity="0.4"
            strokeDasharray="4 6"
            style={{ transformOrigin: "40px 40px", animation: "logo-spin-r 14s linear infinite" }} />
        ) : (
          <circle cx="40" cy="40" r="29" fill="none"
            stroke="#818CF8" strokeWidth="0.8" strokeOpacity="0.4"
            strokeDasharray="4 6" />
        )}

        {/* ── Orbiting particles ── */}
        {animated && (
          <>
            <g style={{ transformOrigin: "40px 40px", animation: "logo-orbit1 4s linear infinite" }}>
              <circle cx="40" cy="40" r="2.5" fill="#93C5FD" filter={`url(#${uid}-pglow)`} />
            </g>
            <g style={{ transformOrigin: "40px 40px", animation: "logo-orbit2 6s linear infinite" }}>
              <circle cx="40" cy="40" r="1.8" fill="#C4B5FD" filter={`url(#${uid}-pglow)`} />
            </g>
            <g style={{ transformOrigin: "40px 40px", animation: "logo-orbit3 9s linear infinite" }}>
              <circle cx="40" cy="40" r="1.4" fill="#67E8F9" filter={`url(#${uid}-pglow)`} />
            </g>
          </>
        )}

        {/* ── Letter M — floating ── */}
        {animated ? (
          <g filter={`url(#${uid}-glow)`}
            style={{ transformOrigin: "40px 40px", animation: "logo-float 3s ease-in-out infinite" }}>
            {/* Shadow / depth */}
            <path d="M19 54V26L29 40L40 26L51 40L61 26V54"
              stroke="white" strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round"
              strokeOpacity="0.15" />
            {/* Main M */}
            <path d="M19 54V26L29 40L40 26L51 40L61 26V54"
              stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            {/* Shine sweep */}
            <path d="M19 54V26L29 40L40 26L51 40L61 26V54"
              stroke="#E0F2FE" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
              strokeDasharray="300" strokeDashoffset="300" opacity="0">
              <animate attributeName="stroke-dashoffset" values="300;0;0" dur="2.5s" repeatCount="indefinite" begin="1s" />
              <animate attributeName="opacity" values="0;1;0" dur="2.5s" repeatCount="indefinite" begin="1s" />
            </path>
          </g>
        ) : (
          <g filter={`url(#${uid}-glow)`}>
            <path d="M19 54V26L29 40L40 26L51 40L61 26V54"
              stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        )}

        {/* ── Rounded border frame ── */}
        <rect x="6" y="6" width="68" height="68" rx="18"
          fill="none" stroke="white" strokeWidth="1" strokeOpacity="0.12" />
      </svg>

      {/* ── Wordmark ── */}
      {variant === "full" && (
        <span className={cn("font-black tracking-tight select-none", text)}
          style={{ letterSpacing: "-0.02em" }}>
          <span className="text-gray-900">MKT</span>
          <span style={{ background: "linear-gradient(135deg,#2563EB,#7C3AED)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Digital
          </span>
        </span>
      )}
    </div>
  );
}

/** Versão para fundos escuros */
export function LogoLight({ className, size = "md", variant = "full", animated = true }: LogoProps) {
  const { text, gap } = sizes[size];
  return (
    <div className={cn("flex items-center", gap, className)}>
      <Logo size={size} variant="icon" animated={animated} />
      {variant === "full" && (
        <span className={cn("font-black tracking-tight text-white select-none", text)}
          style={{ letterSpacing: "-0.02em" }}>
          MKT<span style={{ background: "linear-gradient(135deg,#93C5FD,#C4B5FD)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Digital</span>
        </span>
      )}
    </div>
  );
}
