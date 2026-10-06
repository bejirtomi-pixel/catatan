const readFile = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

// Baca & ciutkan gambar menjadi dataURL (maks dimensi / kualitas terbatas).
export async function compressImage(file, { maxDim = 1000, quality = 0.82 } = {}) {
  if (!file || !file.type) throw new Error('File tidak valid');
  if (!file.type.startsWith('image/')) throw new Error('Hanya gambar yang diizinkan');

  const raw = await readFile(file);
  const img = await loadImage(raw);

  let { width, height } = img;
  const scale = Math.min(1, maxDim / Math.max(width, height));
  width = Math.max(1, Math.round(width * scale));
  height = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);

  const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  return canvas.toDataURL(outputType, quality);
}

export async function fileToDataUrl(file) {
  return readFile(file);
}