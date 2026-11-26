/** Triggers a browser download. The URL is revoked late so slow downloads (and Firefox) are not cut off. */
export function downloadBlob(data: BlobPart, name: string, mime: string) {
  const url = URL.createObjectURL(new Blob([data], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.style.display = 'none'
  document.body.appendChild(a) // Firefox ignores click() on detached anchors
  a.click()
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url) }, 60000)
}
