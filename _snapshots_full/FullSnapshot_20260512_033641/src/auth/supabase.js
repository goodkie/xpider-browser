const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://gfgudbxpkpfevsuobdmr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdmZ3VkYnhwa3BmZXZzdW9iZG1yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3OTczNzYsImV4cCI6MjA5MjM3MzM3Nn0.k3qu4QiHjhbQEhTpr90UIr4ZKGbKA1YbvANE2kYog-c';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

module.exports = { supabase };
