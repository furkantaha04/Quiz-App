import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://wocpdrjadpwgxdwvjyxd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndvY3BkcmphZHB3Z3hkd3ZqeXhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzMDQ1NzksImV4cCI6MjA5MDg4MDU3OX0.yaGXzHOjHcJBtuqNY-V9MhNx6aQqhRLvUx_VJBFLSjM';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
