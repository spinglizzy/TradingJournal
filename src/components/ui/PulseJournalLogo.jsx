/**
 * Uses the actual brand PNG (public/logo.png, 1080×1080).
 * The logo content (PJ mark + wordmark) sits at ~x:22–84%, y:40–61% of the square image.
 * We scale the image so that content height matches `h`, then offset to crop to it.
 */
export function PulseJournalLogo({ size = 'md' }) {
  // imgSize = full-image display px  (content height ≈ 21% of imgSize)
  // offsetX  = how far left  to shift so content's left edge aligns with div edge
  // offsetY  = how far up    to shift so content's top  edge aligns with div edge
  // w        = visible container width (content is ~62% of imgSize wide)
  const cfg = {
    xs: { h: 24, imgSize: 116, offsetX: 26, offsetY: 46, w: 80  },
    sm: { h: 28, imgSize: 134, offsetX: 30, offsetY: 54, w: 93  },
    md: { h: 34, imgSize: 162, offsetX: 36, offsetY: 65, w: 113 },
  }
  const { h, imgSize, offsetX, offsetY, w } = cfg[size] ?? cfg.md

  return (
    <div
      role="img"
      aria-label="PulseJournal"
      style={{
        width: w,
        height: h,
        flexShrink: 0,
        overflow: 'hidden',
        backgroundImage: 'url(/logo.png)',
        backgroundSize: `${imgSize}px ${imgSize}px`,
        backgroundPosition: `-${offsetX}px -${offsetY}px`,
        backgroundRepeat: 'no-repeat',
      }}
    />
  )
}
