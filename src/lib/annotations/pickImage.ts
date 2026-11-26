import { useNotice } from '../../stores/notice'
import { useTools } from '../../stores/tools'

const MAX_EDGE = 1600
const MAX_BYTES = 25 * 1024 * 1024

/** Reads an image file, downsizes it so documents stay small, and re-encodes as PNG (keeps transparency) or JPEG. */
export async function loadPicture(file: File): Promise<{ mime: 'image/png' | 'image/jpeg'; dataUrl: string; aspect: number }> {
  if (file.size > MAX_BYTES) throw new Error('That image is larger than 25 MB.')
  const bitmap = await createImageBitmap(file)
  const ratio = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * ratio))
  canvas.height = Math.max(1, Math.round(bitmap.height * ratio))
  const mime = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png'
  const ctx = canvas.getContext('2d')!
  if (mime === 'image/jpeg') {
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const aspect = bitmap.width / bitmap.height
  bitmap.close()
  return { mime, dataUrl: canvas.toDataURL(mime, 0.9), aspect }
}

/** Image tool: pick a file, then the next click on a page places it. */
export function pickImageToPlace() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/png,image/jpeg,image/webp,image/gif'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    try {
      const pic = await loadPicture(file)
      useTools.getState().set({ pendingImage: pic })
      useTools.getState().setTool('image')
      useNotice.getState().show('info', 'Click on the page where the image should go.')
    } catch (e) {
      useNotice.getState().show('error', e instanceof Error && e.message.includes('25 MB') ? e.message : 'That file could not be read as an image.')
    }
  }
  input.click()
}
