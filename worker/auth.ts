import { betterAuth } from "better-auth";
import { username } from "better-auth/plugins";

declare global {
  interface Env {
    GOOGLE_CLIENT_ID: string;
    GOOGLE_CLIENT_SECRET: string;
    RESEND_API_KEY: string;
    ADMIN_EMAILS?: string;
    ALERT_EMAILS?: string;
  }
}

const DEFAULT_ALERT_EMAILS = [
  "hello@artility.co.uk",
  "temorris@me.com",
];
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

function getAlertRecipients(env: Env) {
  const configuredEmails = env.ALERT_EMAILS?.split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return [
    ...new Set(
      configuredEmails?.length ? configuredEmails : DEFAULT_ALERT_EMAILS,
    ),
  ];
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

async function readResendMessageId(response: Response, label: string) {
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`${label} failed (${response.status}): ${details}`);
  }

  const data = (await response.json()) as { id?: string };

  return data.id ?? null;
}

async function deliverRegistrationAlert(env: Env, userId: string) {
  const user = await env.DB.prepare(`
    SELECT email, name, createdAt
    FROM "user"
    WHERE id = ?
    LIMIT 1
  `)
    .bind(userId)
    .first<{
      email: string;
      name: string | null;
      createdAt: string;
    }>();

  if (!user) {
    return null;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
      "user-agent": "artility-worker/1.0",
    },
    body: JSON.stringify({
      from: "Artility <alerts@send.artility.co.uk>",
      to: getAlertRecipients(env),
      subject: "New Artility registration",
      text: [
        "A new account has been registered on Artility.",
        "",
        `Name: ${user.name?.trim() || "Not provided"}`,
        `Email: ${user.email}`,
        `Registered: ${new Date(user.createdAt).toISOString()}`,
      ].join("\n"),
    }),
  });

  return readResendMessageId(response, "Registration alert delivery");
}

async function deliverArtworkStatusReportAlert(
  env: Env,
  reportId: number,
) {
  const report = await env.DB.prepare(`
    SELECT
      reports.id,
      reports.artwork_id,
      reports.report_type,
      reports.date_observed,
      reports.note,
      reports.photo_storage_key,
      reports.created_at,
      artworks.title AS artwork_title,
      artworks.town,
      artworks.city,
      users.name AS reporter_name,
      users.email AS reporter_email
    FROM artwork_status_reports AS reports
    INNER JOIN artworks
      ON artworks.id = reports.artwork_id
    INNER JOIN "user" AS users
      ON users.id = reports.reporting_user_id
    WHERE reports.id = ?
    LIMIT 1
  `)
    .bind(reportId)
    .first<{
      id: number;
      artwork_id: number;
      report_type: string;
      date_observed: string;
      note: string | null;
      photo_storage_key: string | null;
      created_at: string;
      artwork_title: string | null;
      town: string | null;
      city: string | null;
      reporter_name: string | null;
      reporter_email: string;
    }>();

  if (!report) {
    return null;
  }

  const artworkTitle =
    report.artwork_title?.trim() || `Artwork #${report.artwork_id}`;
  const location =
    [report.town, report.city].filter(Boolean).join(", ") || "Not recorded";
  const reportLabel = report.report_type
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
  const artworkUrl = `https://artility.co.uk/artwork/${report.artwork_id}`;
  const lines = [
    "A new artwork status report was submitted.",
    "",
    `Artwork: ${artworkTitle}`,
    `Location: ${location}`,
    `Reported status: ${reportLabel}`,
    `Date observed: ${report.date_observed}`,
    `Reporter: ${report.reporter_name?.trim() || "Not provided"} <${report.reporter_email}>`,
    `Submitted: ${report.created_at}`,
  ];

  if (report.note) {
    lines.push("", `Note: ${report.note}`);
  }

  if (report.photo_storage_key) {
    lines.push(
      "",
      `Supporting image: https://artility.co.uk/api/images/${encodeURIComponent(report.photo_storage_key)}`,
    );
  }

  lines.push(
    "",
    `Review report: https://artility.co.uk/admin/moderation`,
    `View artwork: ${artworkUrl}`,
  );

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
      "user-agent": "artility-worker/1.0",
    },
    body: JSON.stringify({
      from: "Artility <alerts@send.artility.co.uk>",
      to: getAlertRecipients(env),
      subject: `New status report: ${reportLabel} · ${artworkTitle}`,
      text: lines.join("\n"),
    }),
  });

  return readResendMessageId(response, "Artwork status report alert");
}

type EmailNotificationEvent =
  | "new_registration"
  | "artwork_status_report";

async function enqueueEmailNotification(
  env: Env,
  eventType: EmailNotificationEvent,
  entityId: string,
) {
  await env.DB.prepare(`
    INSERT OR IGNORE INTO email_notification_outbox (
      event_type,
      entity_id
    )
    VALUES (?, ?)
  `)
    .bind(eventType, entityId)
    .run();
}

async function processNextEmailNotification(env: Env) {
  await env.DB.prepare(`
    UPDATE email_notification_outbox
    SET
      state = 'failed',
      last_error = 'Delivery claim expired before completion',
      next_attempt_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE state = 'sending'
      AND updated_at < datetime('now', '-10 minutes')
  `).run();

  const notification = await env.DB.prepare(`
    SELECT id, event_type, entity_id
    FROM email_notification_outbox
    WHERE state IN ('pending', 'failed')
      AND attempt_count < 5
      AND next_attempt_at <= CURRENT_TIMESTAMP
    ORDER BY created_at ASC, id ASC
    LIMIT 1
  `).first<{
    id: number;
    event_type: EmailNotificationEvent;
    entity_id: string;
  }>();

  if (!notification) {
    return;
  }

  const claimed = await env.DB.prepare(`
    UPDATE email_notification_outbox
    SET
      state = 'sending',
      attempt_count = attempt_count + 1,
      last_error = NULL,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND state IN ('pending', 'failed')
  `)
    .bind(notification.id)
    .run();

  if (Number(claimed.meta.changes ?? 0) !== 1) {
    return;
  }

  try {
    const providerMessageId =
      notification.event_type === "new_registration"
        ? await deliverRegistrationAlert(env, notification.entity_id)
        : await deliverArtworkStatusReportAlert(
            env,
            Number(notification.entity_id),
          );

    await env.DB.prepare(`
      UPDATE email_notification_outbox
      SET
        state = 'sent',
        provider_message_id = ?,
        last_error = NULL,
        sent_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
      .bind(providerMessageId, notification.id)
      .run();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown delivery error";

    await env.DB.prepare(`
      UPDATE email_notification_outbox
      SET
        state = 'failed',
        last_error = ?,
        next_attempt_at = datetime('now', '+5 minutes'),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
      .bind(message.slice(0, 1500), notification.id)
      .run();

    throw error;
  }
}

async function enqueueAndProcessEmailNotification(
  env: Env,
  eventType: EmailNotificationEvent,
  entityId: string,
) {
  await enqueueEmailNotification(env, eventType, entityId);
  await processNextEmailNotification(env);
}

export function queueArtworkStatusReportAlert(
  env: Env,
  ctx: ExecutionContext,
  reportId: number,
) {
  ctx.waitUntil(
    enqueueAndProcessEmailNotification(
      env,
      "artwork_status_report",
      String(reportId),
    ).catch((error) => {
      console.error("Artwork status report alert failed:", error);
    }),
  );
}

export function continueEmailNotificationDelivery(
  env: Env,
  ctx: ExecutionContext,
) {
  ctx.waitUntil(
    processNextEmailNotification(env).catch((error) => {
      console.error("Email notification delivery failed:", error);
    }),
  );
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
                enqueueAndProcessEmailNotification(
                  env,
                  "new_registration",
                  user.id,
                ).catch((error) => {
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
