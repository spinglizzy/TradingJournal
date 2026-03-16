/**
 * Crops the transparent 1080×1080 brand PNG to show just the logo lockup.
 * Transparent background means it blends perfectly on any dark surface.
 *
 * Content sits at approx x:14–84%, y:44–63% of the square canvas.
 * We scale the image so content height = h, then offset to align it.
 */
export function PulseJournalLogo({ size = 'md' }) {
  const cfg = {
    //        h    imgSize  offsetX  offsetY   w
    xs: { h: 24, img: 126,  ox: 16,  oy: 53,  w:  94 },
    sm: { h: 28, img: 147,  ox: 19,  oy: 63,  w: 110 },
    md: { h: 34, img: 179,  ox: 23,  oy: 77,  w: 133 },
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
