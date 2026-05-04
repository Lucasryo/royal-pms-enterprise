import Foundation
import Supabase

// Substitua pelos valores do seu projeto Supabase.
// Em producao, leia de um arquivo Config.plist ou variavel de ambiente.
let supabaseURL = URL(string: ProcessInfo.processInfo.environment["SUPABASE_URL"] ?? "https://placeholder.supabase.co")!
let supabaseKey = ProcessInfo.processInfo.environment["SUPABASE_ANON_KEY"] ?? "placeholder"

let supabase = SupabaseClient(supabaseURL: supabaseURL, supabaseKey: supabaseKey)
