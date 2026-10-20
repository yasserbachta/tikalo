import type { CSSProperties } from "react";
import { PdfTemplate } from "@prisma/client";

import { cn } from "@/lib/utils";
import type { PaletteColors } from "@/lib/tickets/templates/palettes";

// ---------------------------------------------------------------------------
// Live ticket miniatures
// ---------------------------------------------------------------------------
// Pure-CSS skeleton reproductions of each PDF template at A4 proportions.
// Text is abstracted into bars, but the composition, the brand surfaces and
// the tinted areas mirror the real @react-pdf output (see
// reference/templates/0N-*.html), so recoloring a miniature shows exactly
// where each palette color lands on the final document.
//
// Everything renders on a fixed 232×328 canvas and scales via CSS transform,
// so the same component serves both the small selector thumbnails and the
// large live preview.

const BASE_W = 232;
const BASE_H = 328;

interface TicketMiniatureProps {
  template: PdfTemplate;
  colors: PaletteColors;
  width?: number;
  className?: string;
}

export function TicketMiniature({
  template,
  colors,
  width = BASE_W,
  className,
}: TicketMiniatureProps) {
  const scale = width / BASE_W;
  const Mini = MINIATURES[template] ?? ClassicMini;
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none select-none", className)}
      style={{ width, height: Math.round(BASE_H * scale) }}
    >
      <div
        className="[&_*]:transition-[background-color,border-color] [&_*]:duration-300"
        style={{
          width: BASE_W,
          height: BASE_H,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        <Mini c={colors} />
      </div>
    </div>
  );
}

// --- primitives --------------------------------------------------------------

type MiniProps = { c: PaletteColors };

function Bar({
  w,
  h = 4,
  c,
  r = 2,
  o,
  style,
}: {
  w: number | string;
  h?: number;
  c: string;
  r?: number;
  o?: number;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        width: w,
        height: h,
        background: c,
        borderRadius: r,
        opacity: o,
        flexShrink: 0,
        ...style,
      }}
    />
  );
}

// label-over-value skeleton pair
function Pair({
  c,
  kw = 18,
  vw = 28,
  vh = 4.5,
  align = "flex-start",
  light = false,
}: {
  c: PaletteColors;
  kw?: number;
  vw?: number;
  vh?: number;
  align?: CSSProperties["alignItems"];
  light?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 3,
        alignItems: align,
      }}
    >
      <Bar w={kw} h={2.5} c={light ? "#ffffff" : c.muted} o={light ? 0.55 : 0.8} />
      <Bar w={vw} h={vh} c={light ? "#ffffff" : c.ink} />
    </div>
  );
}

function Row({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// dashed connector with a circled brand pin — the "route" motif
function Connector({
  c,
  light = false,
  height = 18,
}: {
  c: PaletteColors;
  light?: boolean;
  height?: number;
}) {
  const stroke = light ? "rgba(255,255,255,.65)" : c.brand;
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        margin: "0 8px",
        height,
        minWidth: 30,
      }}
    >
      <div
        style={{
          flex: 1,
          borderTop: `1.5px dashed ${stroke}`,
          opacity: light ? 1 : 0.55,
        }}
      />
      <div
        style={{
          width: 9,
          height: 9,
          borderRadius: 9,
          background: light ? "rgba(255,255,255,.9)" : c.brand,
          margin: "0 4px",
        }}
      />
      <div
        style={{
          flex: 1,
          borderTop: `1.5px dashed ${stroke}`,
          opacity: light ? 1 : 0.55,
        }}
      />
    </div>
  );
}

// big time/city endpoint of a route
function Endpoint({
  c,
  right = false,
  light = false,
  big = 38,
}: {
  c: PaletteColors;
  right?: boolean;
  light?: boolean;
  big?: number;
}) {
  const ink = light ? "#ffffff" : c.ink;
  const mut = light ? "#ffffff" : c.muted;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 3.5,
        alignItems: right ? "flex-end" : "flex-start",
      }}
    >
      <Bar w={big} h={9} c={ink} r={2.5} />
      <Bar w={Math.round(big * 0.62)} h={3.5} c={ink} o={0.85} />
      <Bar w={Math.round(big * 0.8)} h={2.5} c={mut} o={light ? 0.6 : 0.8} />
    </div>
  );
}

function LogoMark({
  c,
  onBrand = false,
  size = 15,
  radius = 4,
}: {
  c: PaletteColors;
  onBrand?: boolean;
  size?: number;
  radius?: number;
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: onBrand ? "rgba(255,255,255,.22)" : c.brand,
        flexShrink: 0,
      }}
    />
  );
}

function Identity({
  c,
  light = false,
}: {
  c: PaletteColors;
  light?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <LogoMark c={c} onBrand={light} />
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <Bar w={48} h={4.5} c={light ? "#fff" : c.ink} />
        <Bar w={30} h={2.5} c={light ? "#fff" : c.muted} o={light ? 0.6 : 0.8} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CLASSIC — brand header band, tinted strips, brand summary
// ---------------------------------------------------------------------------

function ClassicMini({ c }: MiniProps) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#ffffff",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* header band */}
      <Row style={{ background: c.brand, padding: "11px 12px" }}>
        <Identity c={c} light />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 3,
            alignItems: "flex-end",
          }}
        >
          <Bar w={26} h={2.5} c="#fff" o={0.6} />
          <Bar w={38} h={5} c="#fff" />
        </div>
      </Row>
      {/* passenger strip */}
      <Row style={{ background: c.tint, padding: "8px 12px" }}>
        <Pair c={c} kw={20} vw={34} />
        <Pair c={c} kw={16} vw={26} />
        <Pair c={c} kw={18} vw={28} align="flex-end" />
      </Row>
      {/* segments */}
      <div style={{ padding: "10px 12px 0", display: "flex", flexDirection: "column", gap: 9 }}>
        {[0, 1].map((i) => (
          <div key={i}>
            <Row style={{ gap: 5 }}>
              <Bar w={30} h={3} c={c.brand} />
              <div style={{ flex: 1, borderTop: `1px solid ${c.line}` }} />
              <Bar w={26} h={3} c={c.muted} o={0.8} />
            </Row>
            <Row style={{ marginTop: 7 }}>
              <Endpoint c={c} big={34} />
              <Connector c={c} />
              <Endpoint c={c} right big={34} />
            </Row>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 6,
                marginTop: 8,
                paddingTop: 7,
                borderTop: `1px solid ${c.line}`,
              }}
            >
              <Pair c={c} kw={16} vw={24} vh={3.5} />
              <Pair c={c} kw={14} vw={20} vh={3.5} />
              <Pair c={c} kw={16} vw={22} vh={3.5} />
            </div>
          </div>
        ))}
      </div>
      {/* summary */}
      <Row
        style={{
          marginTop: "auto",
          marginLeft: 12,
          marginRight: 12,
          background: c.brand,
          borderRadius: 5,
          padding: "9px 10px",
        }}
      >
        <Pair c={c} light kw={22} vw={30} />
        <Pair c={c} light kw={18} vw={42} vh={7} align="flex-end" />
      </Row>
      {/* footer */}
      <Row style={{ background: c.tint, padding: "8px 12px", marginTop: 10 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <Bar w={36} h={3.5} c={c.ink} />
          <Bar w={48} h={2.5} c={c.muted} o={0.8} />
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 2.5,
            alignItems: "flex-end",
          }}
        >
          <Bar w={30} h={2.5} c={c.muted} />
          <Bar w={38} h={2.5} c={c.muted} />
          <Bar w={34} h={2.5} c={c.muted} />
        </div>
      </Row>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EDITORIAL — white masthead, heavy ink rule, dotted-leader facts
// ---------------------------------------------------------------------------

function EditorialMini({ c }: MiniProps) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#ffffff",
        display: "flex",
        flexDirection: "column",
        padding: "13px 14px 0",
      }}
    >
      <Row>
        <Identity c={c} />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 3,
            alignItems: "flex-end",
          }}
        >
          <Bar w={24} h={2.5} c={c.muted} o={0.8} />
          <Bar w={36} h={5} c={c.ink} />
        </div>
      </Row>
      <div style={{ height: 2.5, background: c.ink, marginTop: 8 }} />
      {/* title row */}
      <Row style={{ marginTop: 10, alignItems: "flex-end" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <Bar w={34} h={3} c={c.brand} />
          <Bar w={82} h={11} c={c.ink} r={3} />
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 3,
            alignItems: "flex-end",
          }}
        >
          <Bar w={22} h={2.5} c={c.muted} o={0.8} />
          <Bar w={44} h={6} c={c.ink} />
        </div>
      </Row>
      {/* segment */}
      <div style={{ marginTop: 12 }}>
        <Row style={{ gap: 5 }}>
          <Bar w={26} h={3} c={c.brand} />
          <div style={{ flex: 1, borderTop: `1px solid ${c.line2 ?? c.line}` }} />
          <Bar w={30} h={3} c={c.muted} o={0.8} />
        </Row>
        <Row style={{ marginTop: 8, alignItems: "flex-start" }}>
          <Endpoint c={c} big={42} />
          {/* flight arc */}
          <div style={{ flex: 1, position: "relative", height: 26, margin: "0 8px" }}>
            <svg
              viewBox="0 0 100 26"
              preserveAspectRatio="none"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
            >
              <path
                d="M2 24 Q50 0 98 24"
                fill="none"
                stroke={c.brand}
                strokeWidth="1.5"
                opacity=".5"
              />
            </svg>
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: 0,
                transform: "translateX(-50%)",
                width: 10,
                height: 10,
                borderRadius: 10,
                background: c.brand,
              }}
            />
          </div>
          <Endpoint c={c} right big={42} />
        </Row>
        {/* dotted-leader facts, 2 columns */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            columnGap: 16,
            marginTop: 10,
            paddingTop: 8,
            borderTop: `1px solid ${c.line}`,
          }}
        >
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "flex-end",
                padding: "4.5px 0",
              }}
            >
              <Bar w={20} h={3} c={c.muted} o={0.8} />
              <div
                style={{
                  flex: 1,
                  borderBottom: `1.5px dotted ${c.line2 ?? c.line}`,
                  margin: "0 5px 1px",
                }}
              />
              <Bar w={24} h={4} c={c.ink} />
            </div>
          ))}
        </div>
      </div>
      {/* outlined summary with ink total block */}
      <div
        style={{
          marginTop: "auto",
          border: `2px solid ${c.ink}`,
          borderRadius: 5,
          display: "flex",
          overflow: "hidden",
        }}
      >
        <div style={{ flex: 1, padding: "8px 9px", borderRight: `1px solid ${c.line}` }}>
          <Pair c={c} kw={24} vw={30} />
        </div>
        <div style={{ flex: 1, padding: "8px 9px" }}>
          <Pair c={c} kw={26} vw={32} />
        </div>
        <div
          style={{
            width: 64,
            background: c.ink,
            padding: "8px 9px",
            display: "flex",
            flexDirection: "column",
            gap: 3.5,
            justifyContent: "center",
          }}
        >
          <Bar w={24} h={2.5} c="#fff" o={0.55} />
          <Bar w={40} h={6.5} c="#fff" />
        </div>
      </div>
      {/* footer */}
      <Row
        style={{
          marginTop: 9,
          paddingTop: 7,
          paddingBottom: 11,
          borderTop: `1px solid ${c.line}`,
          alignItems: "flex-start",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <Bar w={34} h={3.5} c={c.ink} />
          <Bar w={46} h={2.5} c={c.muted} o={0.8} />
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 2.5,
            alignItems: "flex-end",
          }}
        >
          <Bar w={32} h={2.5} c={c.muted} />
          <Bar w={40} h={2.5} c={c.muted} />
        </div>
      </Row>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PREMIUM — rounded surfaces, tinted hero card with chips
// ---------------------------------------------------------------------------

function PremiumMini({ c }: MiniProps) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: c.paper ?? "#ffffff",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Row style={{ padding: "12px 13px 0" }}>
        <Identity c={c} />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            alignItems: "flex-end",
          }}
        >
          <div
            style={{
              background: c.tint,
              borderRadius: 99,
              padding: "3px 8px",
            }}
          >
            <Bar w={30} h={3} c={c.brand} />
          </div>
          <Bar w={36} h={6} c={c.ink} />
        </div>
      </Row>
      {/* passenger ribbon */}
      <Row
        style={{
          margin: "10px 13px 0",
          background: c.tint,
          borderRadius: 8,
          padding: "8px 10px",
        }}
      >
        <Pair c={c} kw={20} vw={34} />
        <Pair c={c} kw={16} vw={28} />
        <Pair c={c} kw={18} vw={24} align="flex-end" />
      </Row>
      {/* segment label */}
      <Row style={{ margin: "10px 13px 0", justifyContent: "flex-start", gap: 6 }}>
        <div style={{ background: c.tint, borderRadius: 5, padding: "3px 7px" }}>
          <Bar w={18} h={3} c={c.brand} />
        </div>
        <Bar w={34} h={3} c={c.muted} o={0.8} />
      </Row>
      {/* hero card */}
      <div
        style={{
          margin: "6px 13px 0",
          background: c.tint,
          border: `1.5px solid ${c.line}`,
          borderRadius: 10,
          padding: "12px 12px 10px",
        }}
      >
        <Row style={{ alignItems: "flex-start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <Bar w={46} h={8} c={c.ink} r={2.5} />
            <Bar w={18} h={3} c={c.brand} />
            <Bar w={30} h={2.5} c={c.muted} o={0.8} />
          </div>
          <Connector c={c} height={14} />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              alignItems: "flex-end",
            }}
          >
            <Bar w={46} h={8} c={c.ink} r={2.5} />
            <Bar w={18} h={3} c={c.brand} />
            <Bar w={30} h={2.5} c={c.muted} o={0.8} />
          </div>
        </Row>
        {/* detail chips */}
        <div style={{ display: "flex", gap: 5, marginTop: 11, flexWrap: "wrap" }}>
          {[22, 18, 24, 20].map((w, i) => (
            <div
              key={i}
              style={{
                background: c.paper ?? "#fff",
                border: `1.5px solid ${c.line}`,
                borderRadius: 7,
                padding: "5px 7px",
                display: "flex",
                flexDirection: "column",
                gap: 2.5,
              }}
            >
              <Bar w={Math.round(w * 0.7)} h={2.5} c={c.muted} o={0.8} />
              <Bar w={w} h={3.5} c={c.ink} />
            </div>
          ))}
        </div>
      </div>
      {/* summary */}
      <Row
        style={{
          margin: "auto 13px 0",
          border: `1.5px solid ${c.line}`,
          borderRadius: 9,
          padding: "9px 11px",
        }}
      >
        <div style={{ display: "flex", gap: 14 }}>
          <Pair c={c} kw={22} vw={28} />
          <Pair c={c} kw={20} vw={26} />
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 3,
            alignItems: "flex-end",
          }}
        >
          <Bar w={20} h={2.5} c={c.brand} />
          <Bar w={42} h={8} c={c.brand} r={2.5} />
        </div>
      </Row>
      {/* footer */}
      <Row style={{ background: c.tint, padding: "9px 13px", marginTop: 10 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <Bar w={34} h={3.5} c={c.ink} />
          <Bar w={46} h={2.5} c={c.muted} o={0.8} />
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 2.5,
            alignItems: "flex-end",
          }}
        >
          <Bar w={32} h={2.5} c={c.muted} />
          <Bar w={38} h={2.5} c={c.muted} />
        </div>
      </Row>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BOLD — full brand band, floating card, bento cells, ink summary
// ---------------------------------------------------------------------------

function BoldMini({ c }: MiniProps) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#ffffff",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* header band */}
      <div style={{ background: c.brand, padding: "12px 13px 26px" }}>
        <Row>
          <Identity c={c} light />
          <div
            style={{
              background: "rgba(255,255,255,.18)",
              borderRadius: 99,
              padding: "3.5px 9px",
            }}
          >
            <Bar w={26} h={3} c="#fff" o={0.9} />
          </div>
        </Row>
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
          <Bar w={34} h={3} c="#fff" o={0.65} />
          <Bar w={78} h={11} c="#fff" r={3} />
        </div>
      </div>
      {/* floating passenger card */}
      <Row
        style={{
          margin: "-16px 13px 0",
          background: "#ffffff",
          borderRadius: 9,
          boxShadow: "0 5px 16px rgba(0,0,0,.13)",
          padding: "9px 11px",
          position: "relative",
        }}
      >
        <Pair c={c} kw={20} vw={36} vh={5.5} />
        <Pair c={c} kw={18} vw={28} />
        <Pair c={c} kw={14} vw={24} align="flex-end" />
      </Row>
      {/* segment label */}
      <Row style={{ margin: "10px 13px 0", justifyContent: "flex-start", gap: 6 }}>
        <div style={{ background: c.tint, borderRadius: 5, padding: "3px 7px" }}>
          <Bar w={16} h={3} c={c.brand} />
        </div>
        <Bar w={32} h={3} c={c.muted} o={0.8} />
      </Row>
      {/* flight card */}
      <div
        style={{
          margin: "6px 13px 0",
          border: `1.5px solid ${c.line}`,
          borderRadius: 10,
          padding: "10px 11px",
        }}
      >
        <Row>
          <div style={{ display: "flex", flexDirection: "column", gap: 3.5 }}>
            <Bar w={36} h={11} c={c.ink} r={3} />
            <Bar w={24} h={2.5} c={c.muted} o={0.8} />
            <Bar w={22} h={4.5} c={c.brand} />
          </div>
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 5,
              margin: "0 8px",
            }}
          >
            <div style={{ background: c.brand, borderRadius: 99, padding: "3px 9px" }}>
              <Bar w={18} h={3} c="#fff" />
            </div>
            <div style={{ width: "100%", borderTop: `1.5px dashed ${c.line2 ?? c.line}` }} />
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 3.5,
              alignItems: "flex-end",
            }}
          >
            <Bar w={36} h={11} c={c.ink} r={3} />
            <Bar w={24} h={2.5} c={c.muted} o={0.8} />
            <Bar w={22} h={4.5} c={c.brand} />
          </div>
        </Row>
        {/* bento cells */}
        <div style={{ display: "flex", gap: 4, marginTop: 9 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              style={{
                flex: 1,
                background: c.tint,
                borderRadius: 6,
                padding: "5px 6px",
                display: "flex",
                flexDirection: "column",
                gap: 2.5,
              }}
            >
              <Bar w="70%" h={2.5} c={c.muted} o={0.8} />
              <Bar w="90%" h={3.5} c={c.ink} />
            </div>
          ))}
        </div>
      </div>
      {/* ink summary */}
      <Row
        style={{
          margin: "auto 13px 0",
          background: c.ink,
          borderRadius: 10,
          padding: "10px 11px",
        }}
      >
        <Pair c={c} light kw={22} vw={28} />
        <Pair c={c} light kw={18} vw={26} />
        <Pair c={c} light kw={18} vw={40} vh={7} align="flex-end" />
      </Row>
      {/* footer */}
      <Row style={{ background: c.tint, padding: "9px 13px", marginTop: 10 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <Bar w={34} h={3.5} c={c.ink} />
          <Bar w={46} h={2.5} c={c.muted} o={0.8} />
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 2.5,
            alignItems: "flex-end",
          }}
        >
          <Bar w={32} h={2.5} c={c.muted} />
          <Bar w={38} h={2.5} c={c.muted} />
        </div>
      </Row>
    </div>
  );
}

// ---------------------------------------------------------------------------
// WALLET — boarding-pass card centered on a tinted page
// ---------------------------------------------------------------------------

function WalletMini({ c }: MiniProps) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: c.bg ?? c.tint,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: 152,
          background: "#ffffff",
          borderRadius: 14,
          overflow: "hidden",
          boxShadow: "0 10px 26px rgba(0,0,0,.18)",
        }}
      >
        {/* brand top */}
        <div style={{ background: c.brand, padding: "11px 12px 12px" }}>
          <Row>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <LogoMark c={c} onBrand size={12} radius={3.5} />
              <div style={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
                <Bar w={34} h={3.5} c="#fff" />
                <Bar w={22} h={2} c="#fff" o={0.6} />
              </div>
            </div>
            <div
              style={{
                background: "rgba(255,255,255,.18)",
                borderRadius: 99,
                padding: "2.5px 7px",
              }}
            >
              <Bar w={18} h={2.5} c="#fff" o={0.9} />
            </div>
          </Row>
          <Row style={{ marginTop: 11 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <Bar w={28} h={8} c="#fff" r={2.5} />
              <Bar w={18} h={3.5} c="#fff" o={0.9} />
              <Bar w={22} h={2} c="#fff" o={0.6} />
            </div>
            <Connector c={c} light height={12} />
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 3,
                alignItems: "flex-end",
              }}
            >
              <Bar w={28} h={8} c="#fff" r={2.5} />
              <Bar w={18} h={3.5} c="#fff" o={0.9} />
              <Bar w={22} h={2} c="#fff" o={0.6} />
            </div>
          </Row>
        </div>
        {/* perforation */}
        <div style={{ position: "relative", height: 0 }}>
          <div
            style={{
              position: "absolute",
              top: -6,
              left: -6,
              width: 12,
              height: 12,
              borderRadius: 12,
              background: c.bg ?? c.tint,
            }}
          />
          <div
            style={{
              position: "absolute",
              top: -6,
              right: -6,
              width: 12,
              height: 12,
              borderRadius: 12,
              background: c.bg ?? c.tint,
            }}
          />
          <div
            style={{
              position: "absolute",
              top: -1,
              left: 10,
              right: 10,
              borderTop: `1.5px dashed ${c.line}`,
            }}
          />
        </div>
        {/* body fields */}
        <div style={{ padding: "12px 12px 10px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "8px 10px",
            }}
          >
            <Pair c={c} kw={18} vw={32} vh={4} />
            <Pair c={c} kw={16} vw={26} vh={4} />
            <Pair c={c} kw={20} vw={30} vh={4} />
            <Pair c={c} kw={14} vw={22} vh={4} />
          </div>
          <Row
            style={{
              marginTop: 10,
              paddingTop: 8,
              borderTop: `1.5px dashed ${c.line}`,
              alignItems: "flex-end",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <Bar w={16} h={2.5} c={c.muted} o={0.8} />
              <Bar w={34} h={7} c={c.ink} r={2.5} />
            </div>
            <Bar w={32} h={8} c={c.brand} r={2.5} />
          </Row>
        </div>
        {/* soft footer */}
        <Row style={{ background: c.soft ?? c.tint, padding: "7px 12px" }}>
          <Bar w={30} h={3} c={c.ink} />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 2,
              alignItems: "flex-end",
            }}
          >
            <Bar w={26} h={2} c={c.muted} />
            <Bar w={30} h={2} c={c.muted} />
          </div>
        </Row>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TIMELINE — brand side rail, vertical itinerary with dots
// ---------------------------------------------------------------------------

function TimelineMini({ c }: MiniProps) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#ffffff",
        display: "flex",
      }}
    >
      {/* side rail */}
      <div
        style={{
          width: 17,
          background: c.brand,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "9px 0",
          flexShrink: 0,
        }}
      >
        <div style={{ width: 8, height: 8, borderRadius: 8, background: "rgba(255,255,255,.85)" }} />
        <Bar w={2.5} h={62} c="#fff" o={0.85} r={2} />
        <Bar w={2.5} h={28} c="#fff" o={0.6} r={2} />
      </div>
      {/* body */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <Row
          style={{
            padding: "10px 11px",
            borderBottom: `1px solid ${c.line}`,
            alignItems: "flex-start",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <Bar w={44} h={4.5} c={c.ink} />
            <Bar w={28} h={2.5} c={c.muted} o={0.8} />
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              alignItems: "flex-end",
            }}
          >
            <div style={{ background: c.tint, borderRadius: 99, padding: "2.5px 7px" }}>
              <Bar w={24} h={2.5} c={c.brand} />
            </div>
            <Bar w={32} h={5.5} c={c.ink} />
          </div>
        </Row>
        {/* passenger band */}
        <Row style={{ background: c.tint, padding: "7px 11px" }}>
          <Pair c={c} kw={18} vw={30} vh={4} />
          <Pair c={c} kw={14} vw={24} vh={4} />
          <Pair c={c} kw={16} vw={22} vh={4} align="flex-end" />
        </Row>
        {/* timeline */}
        <div
          style={{
            margin: "10px 11px 0 18px",
            paddingLeft: 11,
            borderLeft: `2px solid ${c.line}`,
            display: "flex",
            flexDirection: "column",
            gap: 7,
          }}
        >
          {/* node 1 */}
          <div style={{ position: "relative" }}>
            <TimelineDot c={c} />
            <Row>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <Bar w={30} h={4.5} c={c.ink} />
                <div style={{ background: c.tint, borderRadius: 3, padding: "1.5px 4px" }}>
                  <Bar w={10} h={2.5} c={c.brand} />
                </div>
              </div>
              <Bar w={22} h={4.5} c={c.ink} />
            </Row>
          </div>
          {/* leg card */}
          <div
            style={{
              border: `1.5px solid ${c.line}`,
              borderRadius: 8,
              padding: "7px 9px",
            }}
          >
            <Bar w={26} h={3} c={c.brand} />
            <div style={{ display: "flex", gap: 10, marginTop: 5 }}>
              <Pair c={c} kw={14} vw={22} vh={3.5} />
              <Pair c={c} kw={16} vw={20} vh={3.5} />
              <Pair c={c} kw={12} vw={18} vh={3.5} />
            </div>
          </div>
          {/* node 2 */}
          <div style={{ position: "relative" }}>
            <TimelineDot c={c} />
            <Row>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <Bar w={34} h={4.5} c={c.ink} />
                <div style={{ background: c.tint, borderRadius: 3, padding: "1.5px 4px" }}>
                  <Bar w={10} h={2.5} c={c.brand} />
                </div>
              </div>
              <Bar w={22} h={4.5} c={c.ink} />
            </Row>
          </div>
          {/* leg card 2 */}
          <div
            style={{
              border: `1.5px solid ${c.line}`,
              borderRadius: 8,
              padding: "7px 9px",
            }}
          >
            <Bar w={22} h={3} c={c.brand} />
            <div style={{ display: "flex", gap: 10, marginTop: 5 }}>
              <Pair c={c} kw={14} vw={22} vh={3.5} />
              <Pair c={c} kw={16} vw={20} vh={3.5} />
            </div>
          </div>
        </div>
        {/* brand summary */}
        <Row
          style={{
            margin: "auto 11px 0",
            background: c.brand,
            borderRadius: 8,
            padding: "8px 10px",
          }}
        >
          <Pair c={c} light kw={20} vw={26} vh={4} />
          <Pair c={c} light kw={16} vw={36} vh={6.5} align="flex-end" />
        </Row>
        {/* footer */}
        <Row style={{ background: c.tint, padding: "8px 11px", marginTop: 9 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
            <Bar w={30} h={3} c={c.ink} />
            <Bar w={40} h={2.5} c={c.muted} o={0.8} />
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 2,
              alignItems: "flex-end",
            }}
          >
            <Bar w={26} h={2} c={c.muted} />
            <Bar w={30} h={2} c={c.muted} />
          </div>
        </Row>
      </div>
    </div>
  );
}

function TimelineDot({ c }: MiniProps) {
  return (
    <div
      style={{
        position: "absolute",
        left: -17.5,
        top: 0,
        width: 9,
        height: 9,
        borderRadius: 9,
        background: c.brand,
        border: "2px solid #ffffff",
        boxShadow: `0 0 0 1.5px ${c.brand}`,
      }}
    />
  );
}

const MINIATURES: Record<PdfTemplate, (p: MiniProps) => React.ReactElement> = {
  CLASSIC: ClassicMini,
  EDITORIAL: EditorialMini,
  PREMIUM: PremiumMini,
  BOLD: BoldMini,
  WALLET: WalletMini,
  TIMELINE: TimelineMini,
};
