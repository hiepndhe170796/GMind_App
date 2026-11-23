const DECODE_ERROR = 'Không đọc được ảnh này. Hãy chọn ảnh PNG, JPEG hoặc WebP khác.';
const OUT = 256;

async function decode(file: File): Promise<{ source: CanvasImageSource; w: number; h: number; close?: () => void }> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    return { source: bmp, w: bmp.width, h: bmp.height, close: () => bmp.close() };
  } catch {
    // Fallback: HTMLImageElement + object URL (older engines also apply EXIF via image-orientation:from-image default)
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('decode'));
        el.src = url;
      });
      if (!img.naturalWidth || !img.naturalHeight) throw new Error('decode');
      return { source: img, w: img.naturalWidth, h: img.naturalHeight };
    } catch {
      throw new Error(DECODE_ERROR);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob | null>(resolve => canvas.toBlob(b => resolve(b), type, quality));

/** Center-crop to a square and resize to 256×256; webp (png fallback), ≤ 2 MB. */
export async function prepareAvatar(file: File): Promise<Blob> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    throw new Error('Ảnh đại diện chỉ nhận PNG, JPEG hoặc WebP.');
  }
  if (file.size > 10 * 1024 * 1024) throw new Error('Ảnh gốc vượt quá 10 MB.');
  const img = await decode(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = OUT; canvas.height = OUT;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error(DECODE_ERROR);
    const side = Math.min(img.w, img.h);
    const sx = (img.w - side) / 2;
    const sy = (img.h - side) / 2;
    ctx.drawImage(img.source, sx, sy, side, side, 0, 0, OUT, OUT);
    let blob = await toBlob(canvas, 'image/webp', 0.9);
    if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/png');
    if (!blob) throw new Error(DECODE_ERROR);
    if (blob.size > 2 * 1024 * 1024) throw new Error('Ảnh sau khi xử lý vẫn vượt quá 2 MB.');
    return blob;
  } finally {
    img.close?.();
  }
}
