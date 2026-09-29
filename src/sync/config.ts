// Valores públicos por diseño: la clave "anon" solo permite lo que dejan las
// políticas RLS de la base de datos (cada usuario ve únicamente sus filas).
// Se pueden sobrescribir con VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://dmvvlfouwxyepnmrbnfx.supabase.co'
export const ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtdnZsZm91d3h5ZXBubXJibmZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxOTM1ODAsImV4cCI6MjEwNTc2OTU4MH0.R8a4M8AkSRFLQ865fCGFAJ6Y3iwQYcZvTEUTtV806R0'
