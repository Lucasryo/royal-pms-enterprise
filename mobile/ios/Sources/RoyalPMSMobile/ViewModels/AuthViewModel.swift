import Foundation
import Supabase

@MainActor
final class AuthViewModel: ObservableObject {
    @Published var profile: UserProfile?
    @Published var isAuthenticated = false
    @Published var loading = false
    @Published var error: String?

    func signIn(email: String, password: String) async {
        loading = true
        error = nil
        do {
            try await supabase.auth.signIn(email: email, password: password)
            profile = try await fetchProfile()
            isAuthenticated = true
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }

    func signOut() async {
        try? await supabase.auth.signOut()
        profile = nil
        isAuthenticated = false
    }

    func loadSession() async {
        guard let session = try? await supabase.auth.session else { return }
        isAuthenticated = true
        profile = try? await fetchProfile()
    }

    private func fetchProfile() async throws -> UserProfile? {
        guard let uid = try? await supabase.auth.session.user.id.uuidString else { return nil }
        return try await supabase
            .from("profiles")
            .select()
            .eq("id", value: uid)
            .single()
            .execute()
            .value
    }
}
