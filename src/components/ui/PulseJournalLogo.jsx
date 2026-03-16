// PJ monogram + wordmark — matches the brand logo
export function PulseJournalLogo({ size = 'md' }) {
  const small = size === 'sm'
  const markH = small ? 18 : 22
  const fontSize = small ? 13 : 15

  return (
    <div className="flex items-center" style={{ gap: small ? 8 : 9 }}>
      {/* PJ monogram */}
      <svg
        width={markH * (34 / 24)}
        height={markH}
        viewBox="0 0 34 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        style={{ flexShrink: 0 }}
      >
        {/* P — left vert + top bar + bowl right side + bowl bottom */}
        <rect x="0"  y="0"  width="4"  height="24" rx="0.5" fill="#1dc97d" />
        <rect x="0"  y="0"  width="14" height="4"  rx="0.5" fill="#1dc97d" />
        <rect x="10" y="0"  width="4"  height="13" rx="0.5" fill="#1dc97d" />
        <rect x="0"  y="9"  width="14" height="4"  rx="0.5" fill="#1dc97d" />
        {/* J — top bar + right vert + bottom hook */}
        <rect x="20" y="0"  width="14" height="4"  rx="0.5" fill="#1dc97d" />
        <rect x="30" y="0"  width="4"  height="24" rx="0.5" fill="#1dc97d" />
        <rect x="20" y="20" width="14" height="4"  rx="0.5" fill="#1dc97d" />
        <rect x="20" y="15" width="4"  height="9"  rx="0.5" fill="#1dc97d" />
      </svg>

      {/* Wordmark */}
      <span
        style={{
          color: '#ffffff',
          fontWeight: 600,
          fontSize,
          letterSpacing: '-0.3px',
          lineHeight: 1,
          whiteSpace: 'nowrap',
        }}
      >
        PulseJournal
      </span>
    </div>
  )
}
