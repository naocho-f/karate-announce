"use client";

import { SerwistProvider } from "@serwist/turbopack/react";

export function SwRegister() {
  return <SerwistProvider swUrl="/serwist/sw.js" />;
}
