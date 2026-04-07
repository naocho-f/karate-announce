import type { NextConfig } from "next";
import { withSerwist } from "@serwist/turbopack";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" },
    ],
  },
};

const isDisabled =
  process.env.NODE_ENV === "development" ||
  process.env.VERCEL_ENV === "preview";

export default isDisabled ? nextConfig : withSerwist(nextConfig);
