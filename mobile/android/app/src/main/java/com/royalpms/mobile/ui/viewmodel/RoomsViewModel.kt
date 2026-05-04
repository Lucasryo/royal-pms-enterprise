package com.royalpms.mobile.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.royalpms.mobile.data.models.Room
import com.royalpms.mobile.data.repositories.RoomsRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class RoomsViewModel(private val repo: RoomsRepository = RoomsRepository()) : ViewModel() {

    private val _rooms = MutableStateFlow<List<Room>>(emptyList())
    val rooms: StateFlow<List<Room>> = _rooms.asStateFlow()

    private val _loading = MutableStateFlow(false)
    val loading: StateFlow<Boolean> = _loading.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    val roomsByFloor: Map<Int, List<Room>>
        get() = _rooms.value.groupBy { it.floor }.toSortedMap()

    init {
        load()
        viewModelScope.launch {
            runCatching { repo.changes().collect { load() } }
        }
    }

    fun load() {
        viewModelScope.launch {
            _loading.value = true
            runCatching { repo.getAll() }
                .onSuccess { _rooms.value = it }
                .onFailure { _error.value = it.message }
            _loading.value = false
        }
    }

    fun setHousekeepingStatus(room: Room, status: String, notes: String?) {
        viewModelScope.launch {
            runCatching { repo.updateHousekeepingStatus(room.id, status, notes) }
                .onSuccess { load() }
                .onFailure { _error.value = it.message }
        }
    }

    fun toggleBlock(room: Room, notes: String?) {
        viewModelScope.launch {
            runCatching { repo.toggleBlock(room, notes) }
                .onSuccess { load() }
                .onFailure { _error.value = it.message }
        }
    }

    fun clearError() { _error.value = null }
}
