package com.royalpms.mobile.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.royalpms.mobile.data.models.UserProfile
import com.royalpms.mobile.data.repositories.AuthRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class AuthViewModel(private val repo: AuthRepository = AuthRepository()) : ViewModel() {

    private val _profile = MutableStateFlow<UserProfile?>(null)
    val profile: StateFlow<UserProfile?> = _profile.asStateFlow()

    private val _loading = MutableStateFlow(false)
    val loading: StateFlow<Boolean> = _loading.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    val isAuthenticated: StateFlow<Boolean>
        get() {
            val flow = MutableStateFlow(false)
            viewModelScope.launch {
                repo.isAuthenticated.collect { flow.value = it }
            }
            return flow
        }

    fun signIn(email: String, password: String, onSuccess: () -> Unit) {
        viewModelScope.launch {
            _loading.value = true
            _error.value = null
            runCatching { repo.signIn(email, password) }
                .onSuccess {
                    _profile.value = repo.currentProfile()
                    onSuccess()
                }
                .onFailure { _error.value = it.message }
            _loading.value = false
        }
    }

    fun loadProfile() {
        viewModelScope.launch {
            _profile.value = repo.currentProfile()
        }
    }

    fun signOut() {
        viewModelScope.launch {
            runCatching { repo.signOut() }
            _profile.value = null
        }
    }

    fun clearError() { _error.value = null }
}
