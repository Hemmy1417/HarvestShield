/**
 * Preparing a photograph for the record. The runtime's model gateway accepts
 * only PNG and JPEG whose bytes begin FF D8 FF E0 (JFIF), and the contract
 * refuses anything else when it is filed. Phone photos are usually EXIF
 * JPEGs (FF D8 FF E1), so every photograph is redrawn here, at no more than
 * 1,024 pixels on its long edge, and re-encoded as a JFIF JPEG under the
 * contract's size limit.
 */

export const IMAGE_MAX_BYTES = 400_000;
export const MAX_EDGE = 1024;
const JFIF_APP0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00];

export function isJfif(b: Uint8Array): boolean {
  return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff && b[3] === 0xe0;
}

/**
 * A JPEG whose first segment is the JFIF APP0 marker. Canvas encoders write
 * one already; a JPEG without it gets the standard 18-byte segment inserted
 * after its start-of-image marker, which changes no pixel.
 */
export function ensureJfif(jpeg: Uint8Array): Uint8Array {
  if (isJfif(jpeg)) return jpeg;
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error("The encoder did not produce a JPEG.");
  const out = new Uint8Array(jpeg.length + JFIF_APP0.length);
  out.set([0xff, 0xd8], 0);
  out.set(JFIF_APP0, 2);
  out.set(jpeg.subarray(2), 2 + JFIF_APP0.length);
  return out;
}

/** The size a photograph is redrawn at: the long edge at most `edge`. */
export function fitWithin(width: number, height: number, edge = MAX_EDGE): { width: number; height: number } {
  const scale = Math.min(1, edge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export interface PreparedPhoto {
  bytes: Uint8Array;
  width: number;
  height: number;
  /** a blob URL for the preview; revoke when done */
  preview: string;
}

async function encode(canvas: HTMLCanvasElement, quality: number): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("This browser could not encode the photograph.");
  return ensureJfif(new Uint8Array(await blob.arrayBuffer()));
}

/** A photograph from a file the person picked, ready to file. */
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    let edge = MAX_EDGE;
    for (let attempt = 0; attempt < 6; attempt++) {
      const { width, height } = fitWithin(bitmap.width, bitmap.height, edge);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("This browser cannot draw images.");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(bitmap, 0, 0, width, height);
      for (const quality of [0.86, 0.78, 0.7]) {
        const bytes = await encode(canvas, quality);
        if (bytes.length <= IMAGE_MAX_BYTES) {
          const preview = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "image/jpeg" }));
          return { bytes, width, height, preview };
        }
      }
      edge = Math.round(edge * 0.8);
    }
    throw new Error("The photograph could not be reduced below 400 KB.");
  } finally {
    bitmap.close();
  }
}

/** Bytes as the 0x hex calldata genlayer-js sends for a `bytes` argument. */
export function toHex(bytes: Uint8Array): `0x${string}` {
  let out = "0x";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out as `0x${string}`;
}
