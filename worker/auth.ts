import { betterAuth } from "better-auth";
import { username } from "better-auth/plugins";

declare global {
  interface Env {
    GOOGLE_CLIENT_ID: string;
    GOOGLE_CLIENT_SECRET: string;
    RESEND_API_KEY: string;
  }
}

async function deliverVerificationEmail(
  env: Env,
  email: string,
  verificationUrl: string,
) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
      "user-agent": "artility-worker/1.0",
    },
    body: JSON.stringify({
      from: "Artility <verify@send.artility.co.uk>",
      to: [email],
      subject: "Verify your Artility email",
      text: [
        "Welcome to Artility.",
        "",
        "Verify your email to upload artwork, edit details, and check in:",
        verificationUrl,
        "",
        "You can still browse Artility before verifying.",
        "",
        "This link expires in one hour.",
      ].join("\n"),
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(
      `Verification email delivery failed (${response.status}): ${details}`,
    );
  }
}

export function createAuth(env: Env, ctx: ExecutionContext) {
  return betterAuth({
    database: env.DB,

    baseURL: {
      allowedHosts: [
        "artility.co.uk",
        "box-app.yzwgzcng6m.workers.dev",
        "localhost:*",
        "127.0.0.1:*",
      ],
      protocol: "auto",
      fallback: "https://artility.co.uk",
    },

    emailAndPassword: {
      enabled: true,
    },

    emailVerification: {
      sendOnSignUp: true,
      expiresIn: 60 * 60,
      sendVerificationEmail: async ({ user, url }, request) => {
        const delivery = deliverVerificationEmail(env, user.email, url);

        if (
          request &&
          new URL(request.url).pathname.endsWith(
            "/send-verification-email",
          )
        ) {
          await delivery;
          return;
        }

        ctx.waitUntil(
          delivery.catch((error) => {
            console.error("Verification email delivery failed:", error);
          }),
        );
      },
    },

    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
    },

    plugins: [username()],

    user: {
      additionalFields: {
        displayName: {
          type: "string",
          required: false,
        },
      },
    },
  });
}
