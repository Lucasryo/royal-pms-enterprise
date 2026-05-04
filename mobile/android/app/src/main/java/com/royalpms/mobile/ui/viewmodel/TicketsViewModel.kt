package com.royalpms.mobile.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.royalpms.mobile.data.models.MaintenanceTicket
import com.royalpms.mobile.data.repositories.TicketsRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class TicketsViewModel(private val repo: TicketsRepository = TicketsRepository()) : ViewModel() {

    private val _tickets = MutableStateFlow<List<MaintenanceTicket>>(emptyList())
    val tickets: StateFlow<List<MaintenanceTicket>> = _tickets.asStateFlow()

    private val _loading = MutableStateFlow(false)
    val loading: StateFlow<Boolean> = _loading.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    init {
        load()
        viewModelScope.launch {
            runCatching { repo.changes().collect { load() } }
        }
    }

    fun load() {
        viewModelScope.launch {
            _loading.value = true
            runCatching { repo.getActive() }
                .onSuccess { _tickets.value = it }
                .onFailure { _error.value = it.message }
            _loading.value = false
        }
    }

    fun createTicket(roomNumber: String?, title: String, description: String?, priority: String, onDone: () -> Unit) {
        viewModelScope.launch {
            runCatching { repo.create(roomNumber, title, description, priority) }
                .onSuccess { load(); onDone() }
                .onFailure { _error.value = it.message }
        }
    }

    fun updateStatus(ticket: MaintenanceTicket, status: String, notes: String? = null) {
        viewModelScope.launch {
            runCatching { repo.updateStatus(ticket.id, status, notes) }
                .onSuccess { load() }
                .onFailure { _error.value = it.message }
        }
    }

    fun clearError() { _error.value = null }
}
