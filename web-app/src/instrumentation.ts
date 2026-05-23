export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log("[Instrumentation] Starting background processes...");
    // Import the WebSocket manager dynamically so it runs immediately on startup
    await import('./lib/ws');
  }
}
