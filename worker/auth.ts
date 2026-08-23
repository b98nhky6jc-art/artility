import { betterAuth } from "better-auth";
import { username } from "better-auth/plugins";

declare global {
  interface Env {
    GOOGLE_CLIENT_ID: string;
    GOOGLE_CLIENT_SECRET: string;
  }
}

export function createAuth(env: Env) {
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