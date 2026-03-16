/**
 * PulseJournal logo using the actual brand PNG (2000×2000, black background).
 *
 * Pixel analysis found the lockup lives at:
 *   x: 280–1680px (14–84%), y: 870–1130px (43.5–56.5%)
 *
 * mix-blend-mode: lighten makes black pixels show the underlying background,
 * so the black canvas disappears on any dark surface — no visible box.
 */
export function PulseJournalLogo({ size = 'md' }) {
  // scale so content height (260px native) fills `h` display pixels
  const cfg = {
    //       h    img    ox    oy     w
    xs: { h: 22, img: 169, ox: 24, oy:  74, w: 118 },
    sm: { h: 28, img: 215, ox: 30, oy:  94, w: 151 },
    md: { h: 34, img: 262, ox: 37, oy: 114, w: 183 },
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
        mixBlendMode: 'lighten',
      }}
    />
  )
}
