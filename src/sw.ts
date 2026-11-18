/**
 * Service Worker — RemediAide
 *
 * Caching strategies using explicit class instantiation (required by Serwist 9.x).
 * String shorthand handlers ("NetworkFirst", "CacheFirst", etc.) are NOT supported
 * by Serwist 9.x runtimeCaching entries — they are never converted to class instances
 * and produce a broken handler object missing .handle(), causing "no-response" errors.
 *
 * All strategies must use: new CacheFirst({...}), new NetworkOnly({...}), etc.
 */

import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import {
  BackgroundSyncPlugin,
  CacheFirst,
  ExpirationPlugin,
  NetworkOnly,
  Serwist,
} from "serwist";

declare global {
  interface ServiceWorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// Background Sync plugin for POST /api/responses
// Queues failed requests in IndexedDB and retries on reconnect.
const bgSyncPlugin = new BackgroundSyncPlugin("remediaide-responses-queue", {
  maxRetentionTime: 24 * 60, // retain for 24 hours (in minutes)
});

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  // Exclude ALL /api/* routes from the NavigationRoute (navigate fallback).
  // This prevents the SW from intercepting NextAuth callbacks, CSRF endpoints,
  // and any other server-side API handler — they must always hit the network.
  navigateFallbackDenylist: [/^\/api\//],
  runtimeCaching: [
    // Static Next.js assets (_next/static): CacheFirst, 30 days
    {
      matcher: /^\/_next\/static\/.*/,
      handler: new CacheFirst({
        cacheName: "static-assets",
        plugins: [
          new ExpirationPlugin({
            maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
            maxEntries: 200,
          }),
        ],
      }),
    },
    // Auth routes: ALWAYS NetworkOnly, NEVER cached.
    // Listed BEFORE the generic /api/* rule so it matches first.
    {
      matcher: /^\/api\/auth\/.*/,
      handler: new NetworkOnly(),
    },
    // Quiz API: NetworkOnly — data is real-time and per-student, never cache.
    {
      matcher: /\/api\/sessions\/[^/]+\/quiz/,
      handler: new NetworkOnly(),
    },
    // POST /api/responses: NetworkOnly + Background Sync
    {
      matcher: ({ request }: { request: Request }) =>
        request.url.includes("/api/responses") && request.method === "POST",
      handler: new NetworkOnly({
        plugins: [bgSyncPlugin],
      }),
    },
    // All other API routes: NetworkOnly (no caching, always go to network)
    {
      matcher: /^\/api\/.*/,
      handler: new NetworkOnly(),
    },
    // Student quiz pages: NetworkOnly — Client Component with router.push()
    // Must be BEFORE ...defaultCache to override pages-rsc and pages-rsc-prefetch rules
    {
      matcher: /^\/student\/quiz\/.*/,
      handler: new NetworkOnly(),
    },
    // Teacher live session page: NetworkOnly — LiveSessionClient uses router.refresh()
    // which triggers RSC fetch; must not be served from stale cache
    {
      matcher: /^\/dashboard\/sessions\/[^/]+\/live/,
      handler: new NetworkOnly(),
    },
    // Default Next.js cache entries — already uses class instances correctly.
    // Covers: fonts, images, JS/CSS, pages (RSC, HTML), next-data, etc.
    ...defaultCache,
  ],
});

serwist.addEventListeners();
