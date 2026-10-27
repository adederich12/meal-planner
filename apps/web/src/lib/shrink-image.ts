/** Long edge in pixels. Plenty for reading print; Claude scales larger images down anyway. */
const MAX_EDGE = 2000;

/**
 * Shrinks a phone photo to a JPEG under ~1 MB before upload: faster on Wi-Fi,
 * and under Claude's per-image size limit. PDFs and files the browser can't
 * decode (e.g. HEIC on some browsers) pass through unchanged; the API then
 * explains what it accepts.
 */
export async function shrinkImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  let bitmap: ImageBitmap;
  try {
    // Applies the photo's EXIF rotation, so sideways phone shots come out upright.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return file;
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 1_500_000) {
    bitmap.close();
    return file;
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.85),
  );
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
}
