const cfg = {
  xs: { markH: 20, fontSize: 13, gap: 7 },
  sm: { markH: 24, fontSize: 15, gap: 8 },
  md: { markH: 28, fontSize: 17, gap: 9 },
}

export function PulseJournalLogo({ size = 'md' }) {
  const { markH, fontSize, gap } = cfg[size] ?? cfg.md
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap, flexShrink: 0 }}>
      <img
        src="/pj-mark.png"
        alt=""
        style={{ height: markH, width: markH, display: 'block', flexShrink: 0 }}
      />
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
