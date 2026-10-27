import { defineConfig } from "vite";

const RELEASE_CHUNK_WARNING_LIMIT_KIB = 650;

export default defineConfig({
  base: "/classroom-nibbles-tzk/",
  build: {
    chunkSizeWarningLimit: RELEASE_CHUNK_WARNING_LIMIT_KIB,
  },
});
