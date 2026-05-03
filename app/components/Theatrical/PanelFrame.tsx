"use client";

import React, { useId } from "react";

// Expedition 33 — Engraved Plate panel frame.
//
// Design references:
//   - Sandfall Interactive (Brieuc Inisan), Clair Obscur: Expedition 33 (2025)
//   - Belle Époque book frontispieces, French Art Nouveau / Art Deco
//   - "The frame IS the design, not decoration on top of it"
//
// What this component does (and why):
//
//   1. Draws a continuous thin antique-brass rule around the perimeter of
//      the panel. The stroke is 1.25 px and uses an SVG <linearGradient>
//      ramp (shadow → mid → highlight → mid → shadow) so it reads as
//      engraved metal, not a flat painted line.
//
//   2. The TITLE area "interrupts" the top border — the heading text
//      occludes the rule beneath it, so the heading appears engraved
//      INTO the structure of the frame rather than sitting above it.
//      Implemented by drawing the top rule with a deliberate gap in
//      the middle and rendering the heading text in the gap.
//
//   3. Tiny brass diamond terminators at each corner where the strokes
//      meet — a classical Belle Époque punctuation, not a big ornament.
//
//   4. Optional inner nested frame: callers can pass `nested` to render
//      a second, lighter-weight rule a few px inside the outer frame
//      (the "panel-within-panel" pattern from the research).
//
// The component is a pure presentation overlay. It assumes the parent
// container has the `parchment-panel` class for the cream background and
// uses `position: relative` (Tailwind's `fixed` / `absolute` already
// provides this — globals.css does NOT set position so we don't override
// the layout utility).

interface PanelFrameProps {
  // Optional title to engrave into the top border. If provided, the top
  // rule will be drawn with a gap that the title text occupies.
  title?: React.ReactNode;
  // Optional right-of-title content (e.g. count badge, action icon button).
  // Renders aligned to the right edge of the title row.
  trailing?: React.ReactNode;
  // Render the inner nested frame (panel-within-panel).
  nested?: boolean;
}

export const PanelFrame = ({ title, trailing, nested = false }: PanelFrameProps) => {
  const baseId = useId();
  const gradId = `${baseId}-grad`;

  return (
    <>
      {/* Off-screen <svg> hosting the brass linear-gradient. We re-use
          this gradient on every stroke so the engraved metal feels like
          one continuous piece. */}
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden focusable={false}>
        <defs>
          {/* Diagonal ramp so the highlight catches the upper-left edges
              consistently across all strokes — matches the implied light
              direction across the whole dashboard. */}
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#6e5320" />
            <stop offset="32%" stopColor="#a9842f" />
            <stop offset="55%" stopColor="#c9a24a" />
            <stop offset="72%" stopColor="#e6c56e" />
            <stop offset="100%" stopColor="#a9842f" />
          </linearGradient>
        </defs>
      </svg>

      {/* Outer frame strokes — 4 absolute-positioned rules forming the
          rectangle perimeter. Each rule is a thin div with the brass
          gradient as background. Top rule is split when a title is
          provided so the heading can interrupt it. */}
      <FrameRules gradId={gradId} title={title} trailing={trailing} />

      {/* Brass diamond terminators at each corner. They sit on top of the
          stroke-meeting points and read as the punctuation that "binds"
          the four edges together. */}
      {(["tl", "tr", "bl", "br"] as const).map((pos) => (
        <span
          key={pos}
          aria-hidden
          className="absolute pointer-events-none"
          style={{
            width: 6,
            height: 6,
            background: "linear-gradient(135deg, #f1d98a, #a9842f)",
            transform: "rotate(45deg)",
            boxShadow: "0 0 0 0.5px #6e5320",
            [pos.startsWith("t") ? "top" : "bottom"]: -3,
            [pos.endsWith("l") ? "left" : "right"]: -3,
          }}
        />
      ))}

      {/* Optional inner nested frame — a lighter-weight rule a few px
          inside the outer frame. Adds the panel-within-panel feel
          without competing with the outer linework. */}
      {nested && (
        <div
          aria-hidden
          className="absolute pointer-events-none"
          style={{
            top: 8,
            left: 8,
            right: 8,
            bottom: 8,
            border: "1px solid rgba(110, 83, 32, 0.3)",
          }}
        />
      )}
    </>
  );
};

// ────────────────────────────────────────────────────────────────────────
// FrameRules: the four perimeter rules. Top rule is split when a title is
// passed so the heading interrupts it. Implemented as positioned divs
// with the brass gradient — cheaper than an SVG path and easier to
// align pixel-perfectly with the title bar above.
// ────────────────────────────────────────────────────────────────────────

interface FrameRulesProps {
  gradId: string;
  title?: React.ReactNode;
  trailing?: React.ReactNode;
}

const FrameRules = ({ title, trailing }: FrameRulesProps) => {
  // The brass ramp matched to the SVG gradient — used as a CSS
  // linear-gradient on the rule divs so they share visual identity.
  const brassH =
    "linear-gradient(to right, #6e5320 0%, #a9842f 8%, #c9a24a 50%, #a9842f 92%, #6e5320 100%)";
  const brassV =
    "linear-gradient(to bottom, #6e5320 0%, #a9842f 8%, #c9a24a 50%, #a9842f 92%, #6e5320 100%)";

  // Vertical positioning of the top rule. With a title, it sits at the
  // baseline of the title row (so the title visually occludes the rule
  // where they overlap). Without, it sits flush to the top.
  const topRuleTop = title ? 18 : 0;

  return (
    <>
      {/* Title row — only rendered if `title` provided. The title text
          uses the parchment background so it occludes the brass rule
          drawn at the same y position. */}
      {title && (
        <div
          className="absolute left-0 right-0 flex items-center px-4"
          style={{
            top: 6,
            height: 24,
            zIndex: 1,
          }}
        >
          {/* The title block sits ON TOP of the rule. Background-color is
              the parchment cream so where the title text overlaps the
              rule, the rule disappears under the cream — giving the
              "engraved into the frame" effect. */}
          <span
            className="parchment-heading text-sm"
            style={{
              backgroundColor: "var(--parchment-bright)",
              padding: "0 10px",
              boxShadow:
                "-8px 0 0 0 var(--parchment-bright), 8px 0 0 0 var(--parchment-bright)",
            }}
          >
            {title}
          </span>
          {trailing && (
            <span
              className="ml-auto"
              style={{
                backgroundColor: "var(--parchment-bright)",
                paddingLeft: 8,
              }}
            >
              {trailing}
            </span>
          )}
        </div>
      )}

      {/* Top perimeter rule */}
      <span
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          top: topRuleTop,
          left: 0,
          right: 0,
          height: 1.25,
          background: brassH,
        }}
      />
      {/* Bottom rule */}
      <span
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          bottom: 0,
          left: 0,
          right: 0,
          height: 1.25,
          background: brassH,
        }}
      />
      {/* Left rule */}
      <span
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          top: 0,
          bottom: 0,
          left: 0,
          width: 1.25,
          background: brassV,
        }}
      />
      {/* Right rule */}
      <span
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          top: 0,
          bottom: 0,
          right: 0,
          width: 1.25,
          background: brassV,
        }}
      />
    </>
  );
};
