"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** While a background export is queued or running, the export page reloads its data every few seconds. */
export function ExportJobRefresh({ seconds = 5 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(timer);
  }, [router, seconds]);
  return null;
}
