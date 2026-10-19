import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.ts"],
    setupFiles: ["tests/setup/testing-library.ts"],
    // Vitest replaces CSS with an empty string unless told otherwise; the
    // contrast test reads the tokens with ?raw.
    css: { include: [/\/src\/ui\/theme\/tokens\.css/] },
  },
});
