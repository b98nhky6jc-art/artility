type UploadPerformanceDetails = Record<string, unknown>;

const uploadPerformanceEnabled = import.meta.env?.DEV === true;

function round(value: number) {
  return Math.round(value * 10) / 10;
}

export function bytesToMegabytes(bytes: number) {
  return Math.round((bytes / (1024 * 1024)) * 100) / 100;
}

export function startUploadMeasurement(
  stage: string,
  initialDetails: UploadPerformanceDetails = {},
) {
  const startedAt = uploadPerformanceEnabled ? performance.now() : 0;
  let finished = false;

  return {
    finish(details: UploadPerformanceDetails = {}) {
      if (!uploadPerformanceEnabled) {
        return 0;
      }

      const durationMs = round(performance.now() - startedAt);

      if (!finished) {
        console.info(`[Upload performance] ${stage}`, {
          ...initialDetails,
          ...details,
          durationMs,
        });
      }

      finished = true;
      return durationMs;
    },
  };
}

export function logUploadPerformance(
  stage: string,
  details: UploadPerformanceDetails,
) {
  if (uploadPerformanceEnabled) {
    console.info(`[Upload performance] ${stage}`, details);
  }
}
