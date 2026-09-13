import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({ base: "./", root: "desktop/renderer", plugins: [react()], build: { outDir: resolve(import.meta.dirname, "dist/renderer"), emptyOutDir: true } });
