// LiquidGlass: refracts whatever is behind it through an SVG displacement filter in backdrop-filter.
// Chromium renders the refraction; Safari/Firefox fall back to frosted blur (see .liquid-glass in index.css).
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { motion, type HTMLMotionProps } from 'motion/react'

const canRefract =
  typeof navigator !== 'undefined' &&
  !!(
    navigator as Navigator & { userAgentData?: { brands: { brand: string }[] } }
  ).userAgentData?.brands.some((b) => b.brand === 'Chromium')

export interface LiquidGlassProps extends Omit<HTMLMotionProps<'div'>, 'ref' | 'children'> {
  children?: ReactNode
  /** Corner radius in px (9999 = full pill). Also shapes the refracting rim. */
  radius: number
  /** Width of the refracting rim in px. */
  bezel?: number
  /** Maximum displacement at the rim in px. */
  refraction?: number
}

export function LiquidGlass({
  radius,
  bezel = 14,
  refraction = 32,
  className = '',
  style,
  children,
  ...props
}: LiquidGlassProps) {
  const ref = useRef<HTMLDivElement>(null)
  const filterId = `lg${useId().replace(/[^\w-]/g, '')}`
  const [map, setMap] = useState<{ url: string; width: number; height: number } | null>(null)

  // Rebuild the displacement map once the surface settles at a new size.
  useEffect(() => {
    const el = ref.current
    if (!canRefract || !el) return
    let timer = 0
    const build = () => {
      const { offsetWidth: width, offsetHeight: height } = el
      if (width && height)
        setMap({ url: displacementMap(width, height, radius, bezel), width, height })
    }
    const observer = new ResizeObserver(() => {
      window.clearTimeout(timer)
      timer = window.setTimeout(build, 120)
    })
    observer.observe(el)
    return () => {
      observer.disconnect()
      window.clearTimeout(timer)
    }
  }, [radius, bezel])

  return (
    <motion.div
      ref={ref}
      className={`liquid-glass ${className}`}
      data-refract={map ? '' : undefined}
      style={
        { borderRadius: radius, '--lg-filter': `url(#${filterId})`, ...style } as CSSProperties
      }
      {...props}
    >
      {map && (
        <svg
          aria-hidden
          style={{ position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }}
        >
          <filter
            id={filterId}
            x="0"
            y="0"
            width="100%"
            height="100%"
            colorInterpolationFilters="sRGB"
          >
            <feImage
              href={map.url}
              x="0"
              y="0"
              width={map.width}
              height={map.height}
              preserveAspectRatio="none"
              result="map"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="map"
              scale={refraction}
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </svg>
      )}
      {children}
    </motion.div>
  )
}

/** Convex rim as a displacement map: R/G hold x/y offsets around 128; the flat centre is undistorted. */
function displacementMap(width: number, height: number, radius: number, bezel: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  const image = ctx.createImageData(width, height)
  const hw = width / 2
  const hh = height / 2
  const r = Math.min(radius, hw, hh)
  // Signed distance to the rounded rect: negative inside.
  const sdf = (x: number, y: number) => {
    const qx = Math.abs(x) - hw + r
    const qy = Math.abs(y) - hh + r
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
  }
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const x = px + 0.5 - hw
      const y = py + 0.5 - hh
      const depth = -sdf(x, y)
      let dx = 0
      let dy = 0
      if (depth > 0 && depth < bezel) {
        const nx = sdf(x + 1, y) - sdf(x - 1, y)
        const ny = sdf(x, y + 1) - sdf(x, y - 1)
        const len = Math.hypot(nx, ny) || 1
        const t = 1 - depth / bezel
        dx = (-nx / len) * t * t
        dy = (-ny / len) * t * t
      }
      const i = (py * width + px) * 4
      image.data[i] = 128 + dx * 127
      image.data[i + 1] = 128 + dy * 127
      image.data[i + 2] = 128
      image.data[i + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)
  return canvas.toDataURL()
}
