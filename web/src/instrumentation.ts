/** Runs once when the server starts. In the desktop app it resumes syncing with the hub straight away. */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.LOMU_LOCAL_TOKEN) {
    const { startHub } = await import('./server/hub');
    startHub();
  }
}
