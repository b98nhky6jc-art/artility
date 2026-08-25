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

type ModerationResult = {
  flagged?: boolean;
  categories?: Record<string, boolean>;
  category_scores?: Record<string, number>;
};

const SEVERE_REJECT_THRESHOLDS: Record<string, number> = {
  "sexual/minors": 0.8,
  sexual: 0.98,
  "violence/graphic": 0.95,
  "self-harm/instructions": 0.95,
  "hate/threatening": 0.95,
  "harassment/threatening": 0.98,
  "illicit/violent": 0.95,
};

export function decideModerationResult(
  result: ModerationResult,
  requestId: string | null = null,
): ImageModerationDecision {
  const categories = result.categories ?? {};
  const scores = result.category_scores ?? {};

  if (!result.flagged) {
    return {
      outcome: "approve",
      provider: "openai",
      model: "omni-moderation-latest",
      requestId,
      reason: "The moderation response was not flagged.",
      categories,
      scores,
      error: null,
    };
  }

  const automaticReject = Object.entries(SEVERE_REJECT_THRESHOLDS).find(
    ([category, threshold]) =>
      categories[category] === true &&
      Number.isFinite(scores[category]) &&
      scores[category] >= threshold,
  );

  if (automaticReject) {
    return {
      outcome: "reject",
      provider: "openai",
      model: "omni-moderation-latest",
      requestId,
      reason: `Automatically rejected for high-confidence ${automaticReject[0]}.`,
      categories,
      scores,
      error: null,
    };
  }

  const flaggedCategories = Object.entries(categories)
    .filter(([, selected]) => selected)
    .map(([category]) => category);

  return {
    outcome: "manual_review",
    provider: "openai",
    model: "omni-moderation-latest",
    requestId,
    reason: flaggedCategories.length
      ? `Flagged ${flaggedCategories.join(", ")} result requires moderator review.`
      : "The flagged moderation result requires moderator review.",
    categories,
    scores,
    error: null,
  };
}

function logModerationDiagnostics(
  requestId: string | null,
  result: ModerationResult,
  decision: ImageModerationDecision,
) {
  const categories = result.categories ?? {};
  const scores = result.category_scores ?? {};
  const relevantScores = Object.entries(scores)
    .filter(([category, score]) =>
      categories[category] === true ||
      (Number.isFinite(score) && score >= 0.01),
    )
    .sort((left, right) => right[1] - left[1])
    .slice(0, 10);

  console.info(
    "OpenAI image moderation decision",
    JSON.stringify({
      requestId,
      flagged: Boolean(result.flagged),
      outcome: decision.outcome,
      flaggedCategories: Object.entries(categories)
        .filter(([, selected]) => selected)
        .map(([category]) => category),
      relevantScores: Object.fromEntries(relevantScores),
    }),
  );
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
      results?: ModerationResult[];
    };
    const result = data.results?.[0];

    if (!result) {
      return {
        ...manualReviewDecision("OpenAI returned no moderation result"),
        requestId,
      };
    }

    const decision = decideModerationResult(result, requestId);

    logModerationDiagnostics(requestId, result, decision);

    return decision;
  } catch (error) {
    return manualReviewDecision(
      error instanceof Error ? error.message : "Unknown moderation error",
    );
  }
}
