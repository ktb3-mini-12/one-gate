import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://mzjeavvumjqgmbkszahs.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16amVhdnZ1bWpxZ21ia3N6YWhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5NjgzODgsImV4cCI6MjA4MTU0NDM4OH0.Tjwq4hhrj6aXY5pDbhPwKcSSyKb2OlAv9MvbIjq6QtI'

export const supabase = createClient(supabaseUrl, supabaseKey)
