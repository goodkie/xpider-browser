// Electron/Node.js environment polyfill for Supabase
if (typeof global.ReadableStream === 'undefined') {
  try {
    const webStream = require('stream/web');
    global.ReadableStream = webStream.ReadableStream;
    global.WritableStream = webStream.WritableStream;
    global.TransformStream = webStream.TransformStream;
  } catch (e) {
    console.error('Failed to polyfill web streams:', e);
  }
}

if (typeof global.Headers === 'undefined') {
  global.Headers = require('undici').Headers;
}
if (typeof global.Request === 'undefined') {
  global.Request = require('undici').Request;
}
if (typeof global.Response === 'undefined') {
  global.Response = require('undici').Response;
}
if (typeof global.fetch === 'undefined') {
  global.fetch = require('undici').fetch;
}

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://gfgudbxpkpfevsuobdmr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdmZ3VkYnhwa3BmZXZzdW9iZG1yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3OTczNzYsImV4cCI6MjA5MjM3MzM3Nn0.k3qu4QiHjhbQEhTpr90UIr4ZKGbKA1YbvANE2kYog-c';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdmZ3VkYnhwa3BmZXZzdW9iZG1yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njc5NzM3NiwiZXhwIjoyMDkyMzczMzc2fQ.ifTar2cFr_PwTPYc4dv4AegXC_g5sSn3zm9kHUwQJmo';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

module.exports = { supabase, supabaseAdmin };

