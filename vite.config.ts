import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),

    VitePWA({
      registerType: "autoUpdate",

      manifest: {
        name: "Box Hunt",
        short_name: "Box Hunt",
        description: "Find, photograph and check in at street art hiding in plain sight.",

        theme_color: "#082b50",
        background_color: "#f3ead5",

        display: "standalone",
        start_url: "/",
        scope: "/",

        icons: [
          {
            src: "/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },

workbox: {
  cleanupOutdatedCaches: true,

  runtimeCaching: [
    {
      urlPattern: ({ url }) =>
        url.pathname.startsWith("/api/images/"),

      handler: "CacheFirst",

      options: {
        cacheName: "box-hunt-artwork-images",

        expiration: {
          maxEntries: 200,
          maxAgeSeconds: 60 * 60 * 24 * 365,
        },

        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    },
  ],
},
    }),

    cloudflare(),
  ],
});