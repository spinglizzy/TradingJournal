const GREEN = '#1DCB7A'

// SVG recreation of the PJ monogram based on the actual brand mark.
// P: left vertical + closed rectangular upper bowl.
// J: top bar + right vertical + bottom hook going left.
function PJMark({ height }) {
  const w = Math.round(height * 1.56) // viewBox is 56x36 → ratio 1.556
  return (
    <svg
      viewBox="0 0 56 36"
      width={w}
      height={height}
      fill={GREEN}
      aria-hidden="true"
      style={{ flexShrink: 0, display: 'block' }}
    >
      {/* P — left bar + top bar + bowl right side + bowl bottom */}
      <rect x="0"  y="0"  width="7"  height="36" rx="2.5" />
      <rect x="0"  y="0"  width="23" height="7"  rx="2.5" />
      <rect x="16" y="0"  width="7"  height="21" rx="2.5" />
      <rect x="0"  y="14" width="23" height="7"  rx="2.5" />

      {/* J — top bar + right bar + bottom bar + left hook */}
      <rect x="29" y="0"  width="27" height="7"  rx="2.5" />
      <rect x="49" y="0"  width="7"  height="36" rx="2.5" />
      <rect x="29" y="29" width="27" height="7"  rx="2.5" />
      <rect x="29" y="22" width="7"  height="14" rx="2.5" />
    </svg>
  )
}

const cfg = {
  xs: { markH: 18, fontSize: 13, gap: 7  },
  sm: { markH: 22, fontSize: 15, gap: 8  },
  md: { markH: 26, fontSize: 17, gap: 9  },
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
