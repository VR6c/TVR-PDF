// One-off generator for the PWA icons (run: node scripts/make-icons.mjs). Output is committed.
import { createCanvas } from '@napi-rs/canvas'
import { writeFileSync } from 'node:fs'

function icon(size, maskable) {
  const c = createCanvas(size, size)
  const g = c.getContext('2d')
  g.fillStyle = '#2563eb'
  g.fillRect(0, 0, size, size)
  const inset = maskable ? size * 0.2 : size * 0.12
  const w = size - inset * 2
  g.fillStyle = '#ffffff'
  g.beginPath()
  g.roundRect(inset + w * 0.12, inset, w * 0.76, w, size * 0.05)
  g.fill()
  g.fillStyle = '#2563eb'
  g.font = `bold ${size * 0.26}px sans-serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('PDF', size / 2, size / 2 + size * 0.03)
  return c.toBuffer('image/png')
}

writeFileSync('public/icons/icon-192.png', icon(192, false))
writeFileSync('public/icons/icon-512.png', icon(512, false))
writeFileSync('public/icons/maskable-512.png', icon(512, true))
writeFileSync('public/favicon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#2563eb"/><text x="32" y="40" font-family="sans-serif" font-weight="700" font-size="22" fill="#fff" text-anchor="middle">PDF</text></svg>\n`)
