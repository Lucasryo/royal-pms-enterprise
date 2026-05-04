package com.royalpms.mobile.data.repositories

import com.royalpms.mobile.data.models.UserProfile
import com.royalpms.mobile.data.supabase
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.providers.builtin.Email
import io.github.jan.supabase.auth.status.SessionStatus
import io.github.jan.supabase.postgrest.postgrest
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

class AuthRepository {

    suspend fun signIn(email: String, password: String) {
        supabase.auth.signInWith(Email) {
            this.email = email
            this.password = password
        }
    }

    suspend fun signOut() {
        supabase.auth.signOut()
    }

    suspend fun currentProfile(): UserProfile? {
        val uid = supabase.auth.currentUserOrNull()?.id ?: return null
        return supabase.postgrest["profiles"]
            .select { filter { eq("id", uid) } }
            .decodeSingleOrNull()
    }

    val isAuthenticated: Flow<Boolean>
        get() = supabase.auth.sessionStatus.map { it is SessionStatus.Authenticated }
}
