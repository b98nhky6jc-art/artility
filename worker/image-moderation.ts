import type { PreparedImage } from "./image-processing.js";

export type ImageModerationDecision = {
  outcome: "approve" | "reject" | "manual_review";
  provider: "openai";
  model: "omni-moderation-latest";
  requestId: string | null;
  reason: string;
  categories: Record<string, boolean>;
  scores: Record<string, number>;
  error: string | null;
};

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return btoa(binary);
}

function manualReviewDecision(error: string): ImageModerationDecision {
  return {
    outcome: "manual_review",
    provider: "openai",
    model: "omni-moderation-latest",
    requestId: null,
    reason: "Automated moderation was unavailable; moderator review is required.",
    categories: {},
    scores: {},
    error,
  };
}

export async function moderateImage(
  apiKey: string | undefined,
  image: PreparedImage,
  fetcher: typeof fetch = fetch,
): Promise<ImageModerationDecision> {
  if (!apiKey) {
    return manualReviewDecision("OPENAI_API_KEY is not configured");
  }

  try {
    const requestBody = JSON.stringify({
      model: "omni-moderation-latest",
      input: [
        {
          type: "text",
          text: "User-submitted photograph intended for a public street-art gallery.",
        },
        {
          type: "image_url",
          image_url: {
            url: `data:image/jpeg;base64,${bytesToBase64(image.bytes)}`,
          },
        },
      ],
    });
    let response: Response | null = null;
    let lastTransportError = "OpenAI moderation request failed";

    for (let attempt = 0; attempt < 2; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20_000);

      try {
        response = await fetcher("https://api.openai.com/v1/moderations", {
          method: "POST",
          signal: controller.signal,
          headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
            "user-agent": "artility-worker/1.0",
          },
          body: requestBody,
        });

        if (
          response.ok ||
          ![408, 409, 429, 500, 502, 503, 504].includes(response.status)
        ) {
          break;
        }

        lastTransportError = `OpenAI returned retryable status ${response.status}`;
      } catch (error) {
        response = null;
        lastTransportError =
          error instanceof Error ? error.message : "Unknown moderation error";
      } finally {
        clearTimeout(timeout);
      }

      if (attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    }

    if (!response) {
      return manualReviewDecision(lastTransportError);
    }

    const requestId = response.headers.get("x-request-id");

    if (!response.ok) {
      const details = (await response.text()).slice(0, 500);
      return {
        ...manualReviewDecision(`OpenAI returned ${response.status}: ${details}`),
        requestId,
      };
    }

    const data = (await response.json()) as {
      results?: Array<{
        flagged?: boolean;
        categories?: Record<string, boolean>;
        category_scores?: Record<string, number>;
      }>;
    };
    const result = data.results?.[0];

    if (!result) {
      return {
        ...manualReviewDecision("OpenAI returned no moderation result"),
        requestId,
      };
    }

    const categories = result.categories ?? {};
    const scores = result.category_scores ?? {};
    const rejectThresholds: Record<string, number> = {
      "sexual/minors": 0.15,
      sexual: 0.9,
      "violence/graphic": 0.85,
      "self-harm/instructions": 0.85,
    };
    const automaticReject = Object.entries(rejectThresholds).find(
      ([category, threshold]) =>
        categories[category] === true && (scores[category] ?? 0) >= threshold,
    );

    if (automaticReject) {
      return {
        outcome: "reject",
        provider: "openai",
        model: "omni-moderation-latest",
        requestId,
        reason: `Automatically rejected for ${automaticReject[0]}.`,
        categories,
        scores,
        error: null,
      };
    }

    const elevatedScore = Object.entries(scores).find(
      ([, score]) => Number.isFinite(score) && score >= 0.35,
    );

    if (result.flagged || elevatedScore) {
      return {
        outcome: "manual_review",
        provider: "openai",
        model: "omni-moderation-latest",
        requestId,
        reason: elevatedScore
          ? `Borderline ${elevatedScore[0]} result requires moderator review.`
          : "The automated moderation result requires moderator review.",
        categories,
        scores,
        error: null,
      };
    }

    return {
      outcome: "approve",
      provider: "openai",
      model: "omni-moderation-latest",
      requestId,
      reason: "No disallowed image content was detected.",
      categories,
      scores,
      error: null,
    };
  } catch (error) {
    return manualReviewDecision(
      error instanceof Error ? error.message : "Unknown moderation error",
    );
  }
}
