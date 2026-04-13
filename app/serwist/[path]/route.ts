import { resolve } from "node:path";
import { createSerwistRoute } from "@serwist/turbopack";

export const { GET, dynamic, dynamicParams, revalidate, generateStaticParams } = createSerwistRoute({
  swSrc: resolve(process.cwd(), "app/sw.ts"),
  globDirectory: resolve(process.cwd(), ".next"),
  globPatterns: [],
  globIgnores: ["**/node_modules/**/*"],
  injectionPoint: "self.__SW_MANIFEST" as const,
});
