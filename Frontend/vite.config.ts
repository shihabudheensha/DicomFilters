import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import mkcert from "vite-plugin-mkcert";
import { viteCommonjs } from "@originjs/vite-plugin-commonjs";

export default defineConfig({
  server: {
    port: 5173,
  },

  plugins: [
    react(),
    mkcert(),
    viteCommonjs(),
  ],

  optimizeDeps: {
    exclude: ["@cornerstonejs/dicom-image-loader"],
    include: ["dicom-parser"],
  },

  worker: {
    format: "es",
  },
});