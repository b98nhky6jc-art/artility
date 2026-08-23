import { betterAuth } from "better-auth";
import { username } from "better-auth/plugins";

export function createAuth(env: Env) {
  return betterAuth({
    database: env.DB,

    baseURL: {
      allowedHosts: [
        "box-app.yzwgzcng6m.workers.dev",
        "localhost:*",
        "127.0.0.1:*",
      ],
      protocol: "auto",
      fallback: "https://box-app.yzwgzcng6m.workers.dev",
    },

    emailAndPassword: {
      enabled: true,
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