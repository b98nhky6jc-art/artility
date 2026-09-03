import {
  PhotonImage,
  SamplingFilter,
  resize,
} from "@cf-wasm/photon/workerd";
import {
  bytesToMegabytes,
  logUploadPerformance,
  startUploadMeasurement,
} from "../shared/upload-performance.js";

export const MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024;
export const MAX_IMAGE_WIDTH = 6000;
export const MAX_IMAGE_HEIGHT = 6000;
export const MAX_IMAGE_PIXELS = 32_000_000;
export const PUBLISHED_IMAGE_MAX_DIMENSION = 2200;
export const THUMBNAIL_MAX_DIMENSION = 800;

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export type PreparedImage = {
  bytes: Uint8Array;
  thumbnailBytes: Uint8Array;
  sourceMimeType: string;
  storedMimeType: "image/jpeg";
  width: number;
  height: number;
};

export class ImageUploadError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function hasBytes(bytes: Uint8Array, offset: number, expected: number[]) {
  return expected.every((value, index) => bytes[offset + index] === value);
}

export function sniffImageMimeType(bytes: Uint8Array) {
  if (bytes.length >= 3 && hasBytes(bytes, 0, [0xff, 0xd8, 0xff])) {
    return "image/jpeg";
  }

  if (
    bytes.length >= 8 &&
    hasBytes(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  ) {
    return "image/png";
  }

  if (
    bytes.length >= 12 &&
    hasBytes(bytes, 0, [0x52, 0x49, 0x46, 0x46]) &&
    hasBytes(bytes, 8, [0x57, 0x45, 0x42, 0x50])
  ) {
    return "image/webp";
  }

  return null;
}

function dimensionsWithin(
  width: number,
  height: number,
  maximumDimension: number,
) {
  const scale = Math.min(1, maximumDimension / Math.max(width, height));

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export async function prepareImageUpload(file: File): Promise<PreparedImage> {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new ImageUploadError("Photos must be JPEG, PNG, or WebP images.");
  }

  if (file.size <= 0 || file.size > MAX_IMAGE_SIZE_BYTES) {
    throw new ImageUploadError("Each photo must be smaller than 8 MB.");
  }

  const totalMeasurement = startUploadMeasurement(
    `Server image processing: ${file.name}`,
    {
      originalFilename: file.name,
      originalSizeMb: bytesToMegabytes(file.size),
    },
  );
  const fileReadMeasurement = startUploadMeasurement(
    `Server file read: ${file.name}`,
  );
  const inputBytes = new Uint8Array(await file.arrayBuffer());
  fileReadMeasurement.finish({ byteSize: inputBytes.byteLength });
  const detectedMimeType = sniffImageMimeType(inputBytes);

  if (!detectedMimeType || detectedMimeType !== file.type) {
    throw new ImageUploadError(
      "The image contents do not match the selected file type.",
    );
  }

  let source: PhotonImage | null = null;
  let published: PhotonImage | null = null;
  let thumbnail: PhotonImage | null = null;

  try {
    const decodeMeasurement = startUploadMeasurement(
      `Server image decode: ${file.name}`,
    );
    source = PhotonImage.new_from_byteslice(inputBytes);
    const sourceWidth = source.get_width();
    const sourceHeight = source.get_height();
    decodeMeasurement.finish({
      originalDimensions: `${sourceWidth} × ${sourceHeight}`,
    });

    if (
      sourceWidth <= 0 ||
      sourceHeight <= 0 ||
      sourceWidth > MAX_IMAGE_WIDTH ||
      sourceHeight > MAX_IMAGE_HEIGHT ||
      sourceWidth * sourceHeight > MAX_IMAGE_PIXELS
    ) {
      throw new ImageUploadError(
        `Images may be at most ${MAX_IMAGE_WIDTH} × ${MAX_IMAGE_HEIGHT} pixels and 32 megapixels.`,
      );
    }

    const publishedSize = dimensionsWithin(
      sourceWidth,
      sourceHeight,
      PUBLISHED_IMAGE_MAX_DIMENSION,
    );
    const resizeMeasurement = startUploadMeasurement(
      `Server image resize: ${file.name}`,
      {
        originalDimensions: `${sourceWidth} × ${sourceHeight}`,
        resultingDimensions:
          `${publishedSize.width} × ${publishedSize.height}`,
      },
    );
    published = resize(
      source,
      publishedSize.width,
      publishedSize.height,
      SamplingFilter.Lanczos3,
    );

    const thumbnailSize = dimensionsWithin(
      publishedSize.width,
      publishedSize.height,
      THUMBNAIL_MAX_DIMENSION,
    );
    thumbnail = resize(
      published,
      thumbnailSize.width,
      thumbnailSize.height,
      SamplingFilter.Lanczos3,
    );
    resizeMeasurement.finish({
      thumbnailDimensions:
        `${thumbnailSize.width} × ${thumbnailSize.height}`,
    });

    const compressionMeasurement = startUploadMeasurement(
      `Server JPEG compression: ${file.name}`,
    );
    const bytes = published.get_bytes_jpeg(88);
    const thumbnailBytes = thumbnail.get_bytes_jpeg(78);
    compressionMeasurement.finish({
      resultingSizeMb: bytesToMegabytes(bytes.byteLength),
      thumbnailSizeMb: bytesToMegabytes(thumbnailBytes.byteLength),
    });
    const processingDurationMs = totalMeasurement.finish({
      originalDimensions: `${sourceWidth} × ${sourceHeight}`,
      resultingDimensions:
        `${publishedSize.width} × ${publishedSize.height}`,
      resultingSizeMb: bytesToMegabytes(bytes.byteLength),
    });

    logUploadPerformance("Server prepared image summary", {
      originalFilename: file.name,
      originalDimensions: `${sourceWidth} × ${sourceHeight}`,
      originalSizeMb: bytesToMegabytes(file.size),
      resultingDimensions:
        `${publishedSize.width} × ${publishedSize.height}`,
      resultingSizeMb: bytesToMegabytes(bytes.byteLength),
      compressionProcessingDurationMs: processingDurationMs,
    });

    return {
      bytes,
      thumbnailBytes,
      sourceMimeType: detectedMimeType,
      storedMimeType: "image/jpeg",
      width: publishedSize.width,
      height: publishedSize.height,
    };
  } catch (error) {
    totalMeasurement.finish({ outcome: "failed" });

    if (error instanceof ImageUploadError) {
      throw error;
    }

    throw new ImageUploadError(
      "The selected file could not be decoded as a safe image.",
    );
  } finally {
    thumbnail?.free();
    published?.free();
    source?.free();
  }
}
