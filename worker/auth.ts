import { betterAuth } from "better-auth";
import { username } from "better-auth/plugins";

declare global {
  interface Env {
    GOOGLE_CLIENT_ID: string;
    GOOGLE_CLIENT_SECRET: string;
    RESEND_API_KEY: string;
    ADMIN_EMAILS?: string;
    REGISTRATION_ALERT_EMAIL?: string;
  }
}

const DEFAULT_REGISTRATION_ALERT_EMAIL = "hello@artility.co.uk";
const DEFAULT_ADMIN_EMAILS = new Set([
  "hello@artility.co.uk",
  "temorris@me.com",
]);

function isBootstrapAdminEmail(env: Env, email: string) {
  const configuredEmails = env.ADMIN_EMAILS?.split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const adminEmails = configuredEmails?.length
    ? new Set(configuredEmails)
    : DEFAULT_ADMIN_EMAILS;

  return adminEmails.has(email.trim().toLowerCase());
}

async function grantBootstrapAdminRole(
  env: Env,
  user: { id: string; email: string },
) {
  if (!isBootstrapAdminEmail(env, user.email)) {
    return;
  }

  await env.DB.prepare(`
    INSERT OR IGNORE INTO user_roles (user_id, role, granted_by)
    VALUES (?, 'admin', ?)
  `)
    .bind(user.id, "registration-admin-allowlist")
    .run();
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

async function deliverRegistrationAlert(
  env: Env,
  user: { email: string; name?: string | null; createdAt?: Date | string },
) {
  const recipient =
    env.REGISTRATION_ALERT_EMAIL?.trim() ||
    DEFAULT_REGISTRATION_ALERT_EMAIL;
  const registeredAt = user.createdAt
    ? new Date(user.createdAt).toISOString()
    : new Date().toISOString();
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
      "user-agent": "artility-worker/1.0",
    },
    body: JSON.stringify({
      from: "Artility <alerts@send.artility.co.uk>",
      to: [recipient],
      subject: "New Artility registration",
      text: [
        "A new account has been registered on Artility.",
        "",
        `Name: ${user.name?.trim() || "Not provided"}`,
        `Email: ${user.email}`,
        `Registered: ${registeredAt}`,
      ].join("\n"),
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(
      `Registration alert delivery failed (${response.status}): ${details}`,
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
      autoSignInAfterVerification: true,
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

    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            ctx.waitUntil(
              Promise.all([
                grantBootstrapAdminRole(env, user).catch((error) => {
                  console.error("Admin role provisioning failed:", error);
                }),
                deliverRegistrationAlert(env, user).catch((error) => {
                  console.error("Registration alert delivery failed:", error);
                }),
              ]).then(() => undefined),
            );
          },
        },
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
