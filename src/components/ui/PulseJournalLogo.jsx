const GREEN = '#1DCB7A'

/**
 * PJ monogram built from plain rects + an SVG goo filter.
 * The filter: blur → alpha-threshold → composite back onto source colour.
 * Effect: all outer corners round smoothly, all joints merge seamlessly —
 * no crescent gaps where rectangles meet.
 */
function PJMark({ height }) {
  const w = Math.round(height * 1.56)
  return (
    <svg
      viewBox="-2 -2 60 40"
      width={w}
      height={height}
      aria-hidden="true"
      style={{ flexShrink: 0, display: 'block' }}
    >
      <defs>
        <filter id="pj-round" x="-15%" y="-15%" width="130%" height="130%">
          {/* 1. blur the alpha channel */}
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.2" result="blur" />
          {/* 2. threshold: values → sharp rounded shape */}
          <feColorMatrix
            in="blur" type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 20 -8"
            result="mask"
          />
          {/* 3. clip original colour to the rounded mask */}
          <feComposite in="SourceGraphic" in2="mask" operator="in" />
        </filter>
      </defs>

      <g filter="url(#pj-round)" fill={GREEN}>
        {/* ── P ─────────────────────────────────────────────────── */}
        {/* left vertical bar */}
        <rect x="0"  y="0"  width="8" height="36" />
        {/* top horizontal bar */}
        <rect x="0"  y="0"  width="24" height="8" />
        {/* bowl right side (upper half only) */}
        <rect x="16" y="0"  width="8" height="23" />
        {/* bowl bottom / middle bar */}
        <rect x="0"  y="15" width="24" height="8" />

        {/* ── J ─────────────────────────────────────────────────── */}
        {/* top horizontal bar */}
        <rect x="30" y="0"  width="26" height="8" />
        {/* right vertical bar */}
        <rect x="48" y="0"  width="8"  height="36" />
        {/* bottom horizontal bar */}
        <rect x="30" y="28" width="26" height="8" />
        {/* left hook (short vertical connecting bottom-left) */}
        <rect x="30" y="20" width="8"  height="16" />
      </g>
    </svg>
  )
}

const cfg = {
  xs: { markH: 18, fontSize: 13, gap: 7 },
  sm: { markH: 22, fontSize: 15, gap: 8 },
  md: { markH: 26, fontSize: 17, gap: 9 },
}

export function PulseJournalLogo({ size = 'md' }) {
  const { markH, fontSize, gap } = cfg[size] ?? cfg.md
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap, flexShrink: 0 }}>
      <PJMark height={markH} />
      <span style={{
        color: '#ffffff',
        fontWeight: 600,
        fontSize,
        letterSpacing: '-0.2px',
        lineHeight: 1,
        whiteSpace: 'nowrap',
        fontFamily: 'inherit',
      }}>
        PulseJournal
      </span>
    </div>
  )
}
