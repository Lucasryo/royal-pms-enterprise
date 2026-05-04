/**
 * ImgBB upload helper — free unlimited photo hosting.
 *
 * Setup:
 * 1. Create a free account at https://api.imgbb.com/
 * 2. Get your API key
 * 3. Set VITE_IMGBB_API_KEY in your .env
 *
 * Falls back to Supabase Storage if no key is configured.
 */

const IMGBB_API_KEY = (import.meta as any).env?.VITE_IMGBB_API_KEY as string | undefined;

export type UploadedImage = {
  url: string;
  thumbUrl: string;
  deleteUrl?: string;
};

/**
 * Compress an image client-side before upload.
 * Hotel photos rarely need to be more than 1600px wide.
 */
async function compressImage(file: File, maxWidth = 1600, quality = 0.82): Promise<Blob> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });

  const ratio = Math.min(1, maxWidth / img.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * ratio);
  canvas.height = Math.round(img.height * ratio);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context not available');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Compression failed'))),
      'image/jpeg',
      quality,
    );
  });
}

/**
 * Upload an image to ImgBB and return its public URL.
 * The URL is permanent and globally accessible.
 */
export async function uploadImage(file: File): Promise<UploadedImage> {
  if (!IMGBB_API_KEY) {
    throw new Error('VITE_IMGBB_API_KEY nao configurada. Acesse https://api.imgbb.com/ para criar uma chave gratis.');
  }

  const compressed = await compressImage(file);
  const formData = new FormData();
  formData.append('image', compressed, 'photo.jpg');

  const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Falha no upload da foto (${response.status})`);
  }

  const json = await response.json();
  if (!json?.data?.url) throw new Error('Resposta invalida da ImgBB');

  return {
    url: json.data.url as string,
    thumbUrl: (json.data.thumb?.url ?? json.data.url) as string,
    deleteUrl: json.data.delete_url as string | undefined,
  };
}
