"use client";

export interface CourtSettings {
  count: number;
  names: string[];
}

const DEFAULT: CourtSettings = { count: 2, names: ["1", "2"] };

export function getCourtSettings(): CourtSettings {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = localStorage.getItem("court_settings");
    if (!raw) return DEFAULT;
    return JSON.parse(raw) as CourtSettings;
  } catch {
    return DEFAULT;
  }
}

export function saveCourtSettings(s: CourtSettings) {
  localStorage.setItem("court_settings", JSON.stringify(s));
}
