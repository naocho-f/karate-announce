import unwrapLayer from "./postcss-unwrap-layer.mjs";

const config = {
  plugins: [
    ["@tailwindcss/postcss", {}],
    unwrapLayer,
  ],
};

export default config;
