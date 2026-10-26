export const MAX_COMPRESSED_BYTES = 1024 * 1024;
export const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MIN_IMAGE_SIDE = 320;
const MAX_SOURCE_SIDE = 2048;
const QUALITY_STEPS = [0.9, 0.82, 0.72, 0.62, 0.5, 0.4, 0.3];

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("图片压缩失败，请更换图片后重试。"));
    }, type, quality);
  });
}

function detectOutputType() {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    canvas.toBlob((blob) => {
      resolve(blob?.type === "image/webp" ? "image/webp" : "image/jpeg");
    }, "image/webp", 1);
  });
}

async function decodeImage(file) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      return await createImageBitmap(file);
    }
  }

  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("无法读取该图片，请更换图片后重试。"));
    };
    image.src = url;
  });
}

function renderCompressedBlob(image, width, height, type, quality) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前浏览器无法处理图片压缩。");

  if (type === "image/jpeg") {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvasToBlob(canvas, type, quality);
}

export async function compressImage(file, maxBytes = MAX_COMPRESSED_BYTES) {
  const image = await decodeImage(file);
  const sourceWidth = image.width || image.naturalWidth || 1;
  const sourceHeight = image.height || image.naturalHeight || 1;
  const initialScale = Math.min(1, MAX_SOURCE_SIDE / Math.max(sourceWidth, sourceHeight));
  let width = Math.max(1, Math.round(sourceWidth * initialScale));
  let height = Math.max(1, Math.round(sourceHeight * initialScale));
  const outputType = await detectOutputType();
  let qualityIndex = 0;
  let blob = null;

  try {
    for (let pass = 0; pass < 16; pass += 1) {
      blob = await renderCompressedBlob(image, width, height, outputType, QUALITY_STEPS[qualityIndex]);
      if (blob.size <= maxBytes) {
        return new File([blob], file.name, { type: outputType });
      }

      if (qualityIndex < QUALITY_STEPS.length - 1) {
        qualityIndex += 1;
      } else {
        const nextWidth = Math.max(MIN_IMAGE_SIDE, Math.round(width * 0.72));
        const nextHeight = Math.max(MIN_IMAGE_SIDE, Math.round(height * 0.72));
        if (nextWidth === width && nextHeight === height) break;
        width = nextWidth;
        height = nextHeight;
        qualityIndex = 0;
      }
    }
    throw new Error("图片压缩后仍超过 1MB，请更换尺寸更小的图片。");
  } finally {
    image.close?.();
  }
}
