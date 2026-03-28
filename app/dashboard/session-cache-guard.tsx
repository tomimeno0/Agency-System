"use client";

import { useEffect } from "react";

export function SessionCacheGuard() {
  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      // If the dashboard is restored from bfcache, force revalidation against server auth.
      if (event.persisted) {
        window.location.reload();
      }
    };

    window.addEventListener("pageshow", handlePageShow);
    return () => {
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, []);

  return null;
}

