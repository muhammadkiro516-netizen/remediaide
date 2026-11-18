"use client";

import { useEffect } from "react";

/**
 * Unregisters all Service Workers on every page load.
 * This is a temporary fix to clear stale SW cache that causes
 * "no-response" errors intercepting network requests.
 */
export default function SwUnregister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          registration.unregister();
        }
      });
    }
  }, []);

  return null;
}
