// Cheap insurance: refuse to run if NEXT_PUBLIC_SUPABASE_URL points anywhere
// production-shaped. We hit a real Supabase project during tests; the only
// tolerable target is a dev/local one.
export default async function globalSetup(): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!supabaseUrl) return;
  if (/prod|production|live/i.test(supabaseUrl)) {
    throw new Error(
      `[playwright] NEXT_PUBLIC_SUPABASE_URL looks production-shaped (${supabaseUrl}). ` +
        `Refusing to run e2e suite — point at a dev/test project first.`,
    );
  }
}
