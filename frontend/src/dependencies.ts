import { createApiClient } from '@/api/client';
import { createSupabaseAuthService } from '@/auth/supabase-auth-service';
import { supabase } from '@/lib/supabase';

export const authService = createSupabaseAuthService(supabase);

export const apiClient = createApiClient({
  baseUrl: process.env.EXPO_PUBLIC_API_URL!,
  getAccessToken: () => authService.getAccessToken(),
});
