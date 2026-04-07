import { createSerwistRoute } from "@serwist/turbopack";
import { resolve } from "node:path";

export const { GET, dynamic, dynamicParams, revalidate, generateStaticParams } =
  createSerwistRoute({
    swSrc: resolve(process.cwd(), "app/sw.ts"),
    globDirectory: resolve(process.cwd(), ".next"),
    globPatterns: ["static/**/*.{js,css,woff,woff2}"],
    globIgnores: ["**/node_modules/**/*"],
    injectionPoint: "self.__SW_MANIFEST" as const,
  });
