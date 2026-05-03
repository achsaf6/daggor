"use client";

import { useState } from "react";
import {
  Eye,
  EyeOff,
  Flame,
  Layers,
  Play,
  Settings as SettingsIcon,
  Square,
  Volume2,
  X,
} from "lucide-react";

type Mode = "restrained" | "expressive" | "theatrical";

interface ModeTokens {
  durBase: string;
  durSlow: string;
  ease: string;
  fogDuration: string;
  badgeDuration: string;
  // Whether ambient idle effects (breathing pulse, equalizer animation) run.
  ambient: boolean;
  // Whether the projector tile gets its theatrical layer (vignette + breathing border).
  projectorAtmosphere: boolean;
}

const TOKENS: Record<Mode, ModeTokens> = {
  // Linear-style: short, precise, no idle/ambient effects.
  restrained: {
    durBase: "180ms",
    durSlow: "220ms",
    ease: "cubic-bezier(0.2, 0, 0, 1)",
    fogDuration: "240ms",
    badgeDuration: "220ms",
    ambient: false,
    projectorAtmosphere: false,
  },
  // Material 3 emphasized: longer, springier curves; idle pulses and EQ run.
  expressive: {
    durBase: "260ms",
    durSlow: "380ms",
    ease: "cubic-bezier(0.05, 0.7, 0.1, 1)",
    fogDuration: "380ms",
    badgeDuration: "320ms",
    ambient: true,
    projectorAtmosphere: false,
  },
  // Restrained dashboard chrome + atmospheric projector view.
  theatrical: {
    durBase: "180ms",
    durSlow: "220ms",
    ease: "cubic-bezier(0.2, 0, 0, 1)",
    fogDuration: "520ms",
    badgeDuration: "260ms",
    ambient: true,
    projectorAtmosphere: true,
  },
};

const MODE_BLURB: Record<Mode, string> = {
  restrained:
    "Linear-style. 80–220ms transitions, no springs except drag, no idle/ambient effects. Reads as a serious tool. Best for long sessions.",
  expressive:
    "Material 3 emphasized. Generous 260–380ms curves with a soft overshoot, breathing pulse on the current turn, animated soundboard equalizer. Feels alive but more screen activity.",
  theatrical:
    "Dashboard stays restrained, but the /display projector view leans into atmosphere — vignette, breathing accent border, longer fog reveals. Toggleable per campaign.",
};

const MODES: { value: Mode; label: string }[] = [
  { value: "restrained", label: "Restrained" },
  { value: "expressive", label: "Expressive" },
  { value: "theatrical", label: "Theatrical" },
];

const ACCENT = "#D4671A"; // burnt-orange / torchlight

// Inline <style> with mode-driven keyframes. Co-located so the demo can be
// deleted in one shot once the design direction is locked.
const DEMO_CSS = `
:root {
  --demo-accent: ${ACCENT};
  --demo-accent-soft: ${ACCENT}20;
}
@keyframes demo-breathing {
  0%, 100% { transform: scale(1); opacity: 0.45; }
  50%      { transform: scale(1.18); opacity: 0.85; }
}
@keyframes demo-eq-bar {
  0%, 100% { transform: scaleY(0.35); }
  50%      { transform: scaleY(1); }
}
@keyframes demo-projector-breathe {
  0%, 100% { box-shadow: 0 0 0 1px ${ACCENT}33, 0 0 32px -8px ${ACCENT}55; }
  50%      { box-shadow: 0 0 0 1px ${ACCENT}66, 0 0 56px -4px ${ACCENT}99; }
}
@keyframes demo-toast-in {
  from { transform: translate(-50%, -120%); opacity: 0; }
  to   { transform: translate(-50%, 0);     opacity: 1; }
}

.demo-pulse-on {
  animation: demo-breathing 1.6s var(--demo-ease) infinite;
}
.demo-eq-on {
  transform-origin: 50% 100%;
  animation: demo-eq-bar 700ms ease-in-out infinite;
}
.demo-projector-on {
  animation: demo-projector-breathe 4s ease-in-out infinite;
}

@media (prefers-reduced-motion: reduce) {
  .demo-pulse-on,
  .demo-eq-on,
  .demo-projector-on {
    animation: none;
  }
}
`;

export default function DesignDemo() {
  const [mode, setMode] = useState<Mode>("restrained");
  const t = TOKENS[mode];

  return (
    <main
      className="min-h-screen bg-[#09090B] text-neutral-100 px-6 py-10"
      style={
        {
          // Expose tokens as CSS vars so descendants can read them in inline style strings.
          "--demo-dur-base": t.durBase,
          "--demo-dur-slow": t.durSlow,
          "--demo-ease": t.ease,
          "--demo-fog-dur": t.fogDuration,
          "--demo-badge-dur": t.badgeDuration,
        } as React.CSSProperties
      }
    >
      <style>{DEMO_CSS}</style>

      <header className="max-w-5xl mx-auto mb-8">
        <p className="text-[0.7rem] uppercase tracking-[0.4em] text-neutral-500 mb-2">
          Daggor · design preview
        </p>
        <h1 className="text-3xl font-bold tracking-tight">Motion intensity</h1>
        <p className="text-sm text-neutral-400 mt-2 max-w-2xl">
          Toggle modes and try each demo. Hover the buttons, open the drawer, click reveal,
          watch the current-turn highlight. Same widgets, different motion language.
          Tell Claude which mode you want and the rest of Phase 1 will use it.
        </p>
      </header>

      <ModeToggle mode={mode} onChange={setMode} />

      <p className="max-w-3xl mx-auto mt-3 mb-10 text-sm text-neutral-300 bg-[#18181B] border border-white/10 rounded-lg px-4 py-3">
        <span className="font-semibold mr-2" style={{ color: ACCENT }}>
          {mode}:
        </span>
        {MODE_BLURB[mode]}
      </p>

      <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4">
        <DemoCard title="Hover &amp; press" caption="Buttons, focus rings, tooltips.">
          <HoverPressDemo />
        </DemoCard>

        <DemoCard title="Drawer / sheet" caption="Slide-in panel from the right.">
          <DrawerDemo />
        </DemoCard>

        <DemoCard title="Tooltip" caption="Hover the icon.">
          <TooltipDemo />
        </DemoCard>

        <DemoCard
          title="Current turn"
          caption={
            t.ambient
              ? "Breathing pulse + halo on the active token."
              : "Static halo only — attention via color, not motion."
          }
        >
          <CurrentTurnDemo ambient={t.ambient} />
        </DemoCard>

        <DemoCard
          title="Soundboard equalizer"
          caption={t.ambient ? "Bars dance while playing." : "Static bars; play state via color."}
        >
          <SoundboardDemo ambient={t.ambient} />
        </DemoCard>

        <DemoCard
          title="Fog of war reveal"
          caption={`clip-path scale-up over ${t.fogDuration}.`}
        >
          <FogRevealDemo />
        </DemoCard>

        <DemoCard
          title="&quot;Your turn&quot; notification"
          caption={`Slide-from-top toast (${t.badgeDuration}).`}
        >
          <YourTurnDemo />
        </DemoCard>

        <DemoCard
          title="/display projector tile"
          caption={
            t.projectorAtmosphere
              ? "Vignette + breathing accent border."
              : "Plain canvas, no atmospheric effects."
          }
        >
          <ProjectorTileDemo theatrical={t.projectorAtmosphere} />
        </DemoCard>
      </div>

      <footer className="max-w-5xl mx-auto mt-10 text-xs text-neutral-500">
        prefers-reduced-motion is honored — idle pulses stop automatically.
      </footer>
    </main>
  );
}

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div
      role="tablist"
      aria-label="Motion intensity"
      className="max-w-3xl mx-auto flex bg-[#18181B] border border-white/10 rounded-lg p-1"
    >
      {MODES.map((m) => {
        const active = mode === m.value;
        return (
          <button
            key={m.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(m.value)}
            className="flex-1 rounded-md py-2 px-3 text-sm font-medium transition-colors"
            style={{
              transitionDuration: "var(--demo-dur-base)",
              transitionTimingFunction: "var(--demo-ease)",
              backgroundColor: active ? ACCENT : "transparent",
              color: active ? "#fff" : "rgba(255,255,255,0.7)",
            }}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

function DemoCard({
  title,
  caption,
  children,
}: {
  title: string;
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-[#18181B] border border-white/10 rounded-lg p-4 flex flex-col gap-3 min-h-[180px]">
      <div>
        <h2
          className="text-sm font-semibold tracking-wide"
          dangerouslySetInnerHTML={{ __html: title }}
        />
        <p className="text-xs text-neutral-500">{caption}</p>
      </div>
      <div className="flex-1 flex items-center justify-center bg-[#0F0F11] border border-white/5 rounded-md p-4">
        {children}
      </div>
    </section>
  );
}

function HoverPressDemo() {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className="rounded-md px-4 py-2 text-sm font-medium text-white"
        style={{
          backgroundColor: ACCENT,
          transitionProperty: "background-color, transform, box-shadow",
          transitionDuration: "var(--demo-dur-base)",
          transitionTimingFunction: "var(--demo-ease)",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 0 0 4px ${ACCENT}33`;
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.boxShadow = "none";
        }}
        onMouseDown={(e) => {
          (e.currentTarget as HTMLButtonElement).style.transform = "scale(0.97)";
        }}
        onMouseUp={(e) => {
          (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
        }}
      >
        Primary
      </button>
      <button
        type="button"
        className="rounded-md px-4 py-2 text-sm font-medium text-white border border-white/20 bg-white/5 hover:bg-white/10"
        style={{
          transitionProperty: "background-color, border-color",
          transitionDuration: "var(--demo-dur-base)",
          transitionTimingFunction: "var(--demo-ease)",
        }}
      >
        Secondary
      </button>
      <button
        type="button"
        className="rounded-md p-2 text-white/70 hover:text-white hover:bg-white/10"
        style={{
          transitionProperty: "color, background-color",
          transitionDuration: "var(--demo-dur-base)",
          transitionTimingFunction: "var(--demo-ease)",
        }}
        aria-label="Settings"
      >
        <SettingsIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

function DrawerDemo() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative w-full h-32 bg-[#09090B] border border-white/5 rounded-md overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="absolute top-2 left-2 rounded-md px-3 py-1.5 text-xs font-medium text-white"
        style={{
          backgroundColor: ACCENT,
          transitionDuration: "var(--demo-dur-base)",
          transitionTimingFunction: "var(--demo-ease)",
        }}
      >
        {open ? "Close" : "Open drawer"}
      </button>
      <div
        className="absolute right-0 top-0 bottom-0 w-44 bg-[#18181B] border-l border-white/10 px-3 py-3 flex flex-col gap-2"
        style={{
          transform: open ? "translateX(0)" : "translateX(100%)",
          transitionProperty: "transform",
          transitionDuration: "var(--demo-dur-slow)",
          transitionTimingFunction: "var(--demo-ease)",
        }}
      >
        <div className="flex items-center justify-between">
          <span className="text-[0.65rem] uppercase tracking-[0.3em] text-white/60">
            Settings
          </span>
          <button
            onClick={() => setOpen(false)}
            className="text-white/60 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="text-xs text-white/70">Grid scale</div>
        <div className="h-2 rounded bg-white/10 overflow-hidden">
          <div className="h-full" style={{ width: "60%", backgroundColor: ACCENT }} />
        </div>
        <div className="text-xs text-white/70 mt-1">Offset</div>
        <div className="text-xs font-mono text-white/50">x 0 · y 0</div>
      </div>
    </div>
  );
}

function TooltipDemo() {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="rounded-md p-3 bg-white/5 border border-white/10 text-white"
        aria-label="Layers"
      >
        <Layers className="h-5 w-5" />
      </button>
      <div
        role="tooltip"
        className="absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full whitespace-nowrap px-2 py-1 rounded-md text-[0.7rem] bg-white text-black pointer-events-none"
        style={{
          opacity: open ? 1 : 0,
          transform: `translate(-50%, ${open ? "-100%" : "calc(-100% + 4px)"})`,
          transitionProperty: "opacity, transform",
          transitionDuration: "var(--demo-dur-base)",
          transitionTimingFunction: "var(--demo-ease)",
        }}
      >
        Map manager
      </div>
    </div>
  );
}

function CurrentTurnDemo({ ambient }: { ambient: boolean }) {
  return (
    <div className="flex items-center gap-6">
      {/* Inactive */}
      <div className="flex flex-col items-center gap-2">
        <span className="text-[0.6rem] uppercase tracking-wider text-white/50">Idle</span>
        <div className="relative w-12 h-12">
          <div
            className="absolute inset-0 rounded-full border-2"
            style={{ borderColor: "#3F3F46", backgroundColor: "#52525B" }}
          />
        </div>
      </div>
      {/* Current turn */}
      <div className="flex flex-col items-center gap-2">
        <span className="text-[0.6rem] uppercase tracking-wider" style={{ color: ACCENT }}>
          Current
        </span>
        <div className="relative w-12 h-12">
          <div
            className={`absolute -inset-2 rounded-full ${ambient ? "demo-pulse-on" : ""}`}
            style={{
              backgroundColor: ambient ? `${ACCENT}66` : `${ACCENT}33`,
              filter: "blur(4px)",
            }}
          />
          <div
            className="absolute inset-0 rounded-full border-2"
            style={{ borderColor: ACCENT, backgroundColor: "#7C2D12" }}
          />
        </div>
      </div>
    </div>
  );
}

function SoundboardDemo({ ambient }: { ambient: boolean }) {
  return (
    <div className="flex flex-col gap-2 w-full max-w-xs">
      <div
        className="flex items-center gap-2 rounded-md px-2 py-2 border"
        style={{
          borderColor: `${ACCENT}80`,
          backgroundColor: `${ACCENT}1A`,
        }}
      >
        <button
          className="rounded-md p-1.5"
          style={{ backgroundColor: ACCENT, color: "#fff" }}
          aria-label="Stop"
        >
          <Square className="h-3 w-3 fill-current" />
        </button>
        <span className="text-xs flex-1 truncate text-white">Tavern ambient</span>
        <Equalizer animated={ambient} />
      </div>
      <div className="flex items-center gap-2 rounded-md px-2 py-2 border border-white/10 bg-white/5">
        <button className="rounded-md p-1.5 hover:bg-white/10" aria-label="Play">
          <Play className="h-3 w-3" />
        </button>
        <span className="text-xs flex-1 truncate text-white/70">Combat 1</span>
        <Volume2 className="h-3.5 w-3.5 text-white/30" />
      </div>
    </div>
  );
}

function Equalizer({ animated }: { animated: boolean }) {
  const heights = [0.55, 0.85, 0.4, 0.7];
  const delays = ["0ms", "120ms", "240ms", "360ms"];
  return (
    <div className="flex items-end gap-[2px] h-4 w-6" aria-hidden>
      {heights.map((h, i) => (
        <span
          key={i}
          className={`flex-1 rounded-sm ${animated ? "demo-eq-on" : ""}`}
          style={{
            height: animated ? "100%" : `${h * 100}%`,
            backgroundColor: ACCENT,
            animationDelay: animated ? delays[i] : undefined,
          }}
        />
      ))}
    </div>
  );
}

function FogRevealDemo() {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="relative w-48 h-32 bg-gradient-to-br from-[#27272A] to-[#3F3F46] border border-white/10 rounded-md overflow-hidden">
      {/* Mock map content */}
      <div className="absolute inset-3 grid grid-cols-4 grid-rows-3 gap-1">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="rounded bg-white/5" />
        ))}
      </div>
      {/* Fog overlay using SVG mask. The reveal rect grows over fogDuration. */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        <defs>
          <mask id="demo-fog-mask">
            <rect width="100%" height="100%" fill="white" />
            <rect
              x="25%"
              y="20%"
              width="50%"
              height="60%"
              fill="black"
              style={{
                opacity: revealed ? 1 : 0,
                transformOrigin: "50% 50%",
                transform: revealed ? "scale(1)" : "scale(0)",
                transitionProperty: "opacity, transform",
                transitionDuration: "var(--demo-fog-dur)",
                transitionTimingFunction: "var(--demo-ease)",
              }}
            />
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="#000" mask="url(#demo-fog-mask)" />
      </svg>
      <button
        type="button"
        onClick={() => setRevealed((v) => !v)}
        className="absolute bottom-2 left-2 rounded-md px-2 py-1 text-[0.65rem] font-medium text-white"
        style={{
          backgroundColor: revealed ? "rgba(255,255,255,0.15)" : ACCENT,
          transitionDuration: "var(--demo-dur-base)",
          transitionTimingFunction: "var(--demo-ease)",
        }}
      >
        {revealed ? <span className="inline-flex items-center gap-1"><EyeOff className="h-3 w-3" /> Hide</span> : <span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" /> Reveal</span>}
      </button>
    </div>
  );
}

function YourTurnDemo() {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative w-48 h-32 bg-[#09090B] border border-white/10 rounded-md overflow-hidden flex items-center justify-center">
      <button
        type="button"
        onClick={() => {
          setShown(false);
          // Re-trigger the animation each click.
          requestAnimationFrame(() => setShown(true));
          window.setTimeout(() => setShown(false), 2400);
        }}
        className="rounded-md px-3 py-1.5 text-xs font-medium text-white"
        style={{
          backgroundColor: ACCENT,
          transitionDuration: "var(--demo-dur-base)",
          transitionTimingFunction: "var(--demo-ease)",
        }}
      >
        Trigger
      </button>
      {shown && (
        <div
          className="absolute top-2 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full text-[0.65rem] uppercase tracking-[0.25em] text-white shadow-lg"
          style={{
            backgroundColor: ACCENT,
            animation: `demo-toast-in var(--demo-badge-dur) var(--demo-ease) both`,
          }}
        >
          Your turn
        </div>
      )}
    </div>
  );
}

function ProjectorTileDemo({ theatrical }: { theatrical: boolean }) {
  return (
    <div
      className={`relative w-56 h-32 rounded-md overflow-hidden ${
        theatrical ? "demo-projector-on" : ""
      }`}
      style={{
        background:
          "radial-gradient(circle at 30% 40%, #3F3F46, #18181B 70%)",
        border: theatrical ? `1px solid ${ACCENT}66` : "1px solid rgba(255,255,255,0.1)",
      }}
    >
      {/* mock grid */}
      <div className="absolute inset-2 grid grid-cols-6 grid-rows-3 gap-[1px]">
        {Array.from({ length: 18 }).map((_, i) => (
          <div key={i} className="bg-white/5 rounded-[2px]" />
        ))}
      </div>
      {/* tokens */}
      <div
        className="absolute"
        style={{
          left: "30%",
          top: "40%",
          width: 16,
          height: 16,
          borderRadius: "50%",
          backgroundColor: ACCENT,
          border: "2px solid #fff",
        }}
      />
      <div
        className="absolute"
        style={{
          left: "55%",
          top: "55%",
          width: 16,
          height: 16,
          borderRadius: "50%",
          backgroundColor: "#3B82F6",
          border: "2px solid #fff",
        }}
      />
      {/* vignette only when theatrical */}
      {theatrical && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.55) 100%)",
          }}
        />
      )}
      {theatrical && (
        <div
          className="absolute bottom-1.5 right-2 text-[0.55rem] uppercase tracking-[0.3em] text-white/70 inline-flex items-center gap-1"
        >
          <Flame className="h-2.5 w-2.5" style={{ color: ACCENT }} />
          atmosphere on
        </div>
      )}
    </div>
  );
}
