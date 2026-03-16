const heights = { xs: 20, sm: 24, md: 30 }

export function PulseJournalLogo({ size = 'md' }) {
  const h = heights[size] ?? heights.md
  return (
    <img
      src="/logo-white.png"
      alt="PulseJournal"
      style={{ height: h, width: 'auto', display: 'block', flexShrink: 0 }}
    />
  )
}
