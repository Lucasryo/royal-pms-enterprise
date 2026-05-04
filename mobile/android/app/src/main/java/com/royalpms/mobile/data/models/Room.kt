package com.royalpms.mobile.data.models

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class Room(
    val id: String,
    @SerialName("room_number") val roomNumber: String,
    val floor: Int,
    val category: String,
    @SerialName("sea_view") val seaView: Boolean = false,
    val status: String,
    @SerialName("housekeeping_status") val housekeepingStatus: String,
    @SerialName("maintenance_notes") val maintenanceNotes: String? = null,
    @SerialName("last_cleaned_at") val lastCleanedAt: String? = null,
    @SerialName("is_virtual") val isVirtual: Boolean = false,
    @SerialName("updated_at") val updatedAt: String? = null,
)

val Room.isBlocked get() = status == "maintenance" || housekeepingStatus == "out_of_order"

val Room.statusLabel get() = when (status) {
    "available"   -> "Disponivel"
    "occupied"    -> "Ocupada"
    "maintenance" -> "Manutencao"
    "reserved"    -> "Reservada"
    else          -> status
}

val Room.housekeepingLabel get() = when (housekeepingStatus) {
    "clean"       -> "Limpa"
    "dirty"       -> "Suja"
    "inspected"   -> "Inspecionada"
    "out_of_order" -> "Bloqueada"
    else          -> housekeepingStatus
}
