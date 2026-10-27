// Load .env for standalone scripts (Next.js loads it itself). Existing
// environment variables are never overridden.
try {
  process.loadEnvFile();
} catch {
  // no .env file, rely on the real environment
}
