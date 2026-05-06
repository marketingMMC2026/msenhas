import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://pbyzutiahyihmagenzsd.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBieXp1dGlhaHlpaG1hZ2VuenNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0MzkyODcsImV4cCI6MjA4NjAxNTI4N30.NuyuJV8IXIAanvCSb435B9ytXTyRy0qhKNRz__govds';

const customSupabaseClient = createClient(supabaseUrl, supabaseAnonKey);

export default customSupabaseClient;

export { 
    customSupabaseClient,
    customSupabaseClient as supabase,
};
