package com.royalpms.mobile.data.models

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class MaintenanceTicket(
    val id: String,
    @SerialName("room_id") val roomId: String? = null,
    @SerialName("room_number") val roomNumber: String? = null,
    val title: String,
    val description: String? = null,
    val priority: String,
    val status: String,
    @SerialName("assigned_to") val assignedTo: String? = null,
    @SerialName("reported_by") val reportedBy: String? = null,
    @SerialName("due_at") val dueAt: String? = null,
    @SerialName("started_at") val startedAt: String? = null,
    @SerialName("resolved_at") val resolvedAt: String? = null,
    @SerialName("resolution_notes") val resolutionNotes: String? = null,
    @SerialName("created_at") val createdAt: String,
    @SerialName("updated_at") val updatedAt: String? = null,
)

val MaintenanceTicket.priorityLabel get() = when (priority) {
    "low"    -> "Baixa"
    "medium" -> "Media"
    "high"   -> "Alta"
    "urgent" -> "Urgente"
    else     -> priority
}

val MaintenanceTicket.statusLabel get() = when (status) {
    "open"        -> "Aberto"
    "in_progress" -> "Em andamento"
    "resolved"    -> "Resolvido"
    "cancelled"   -> "Cancelado"
    else          -> status
}
