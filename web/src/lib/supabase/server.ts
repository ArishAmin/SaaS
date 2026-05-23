import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function getSupabaseServerClient() {
  const cookieStore = await cookies();

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          const cookieStoreWithSet = cookieStore as unknown as {
            set: (name: string, value: string, options: unknown) => void | Promise<void>;
          };
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStoreWithSet.set(name, value, options);
          });
        } catch {
          // Supported by Supabase docs: ignores cookie errors when called from Server Components
        }
      },
    },
  });
}

