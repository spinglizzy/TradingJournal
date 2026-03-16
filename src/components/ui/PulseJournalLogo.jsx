/**
 * PulseJournal logo — rendered from the brand PNG (1280×1280 RGBA).
 * Pixel-scanned content bounds: x:299–951, y:583–697 (native pixels).
 * Background is truly transparent so it blends on any surface.
 */
export function PulseJournalLogo({ size = 'md' }) {
  // scale so content height (114 native px) == h display px
  const cfg = {
    //       h    img    ox    oy     w
    xs: { h: 22, img: 247, ox: 58, oy: 113, w: 128 },
    sm: { h: 28, img: 314, ox: 73, oy: 143, w: 162 },
    md: { h: 34, img: 382, ox: 89, oy: 174, w: 196 },
  }
  const { h, img, ox, oy, w } = cfg[size] ?? cfg.md

  return (
    <div
      role="img"
      aria-label="PulseJournal"
      style={{
        width: w,
        height: h,
        flexShrink: 0,
        overflow: 'hidden',
        backgroundImage: 'url(/logo-transparent.png)',
        backgroundSize: `${img}px ${img}px`,
        backgroundPosition: `-${ox}px -${oy}px`,
        backgroundRepeat: 'no-repeat',
      }}
    />
  )
}
