package com.royalpms.mobile.data.repositories

import com.royalpms.mobile.data.models.MaintenanceTicket
import com.royalpms.mobile.data.supabase
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Order
import io.github.jan.supabase.realtime.PostgresAction
import io.github.jan.supabase.realtime.channel
import io.github.jan.supabase.realtime.postgresChangeFlow
import io.github.jan.supabase.realtime.realtime
import kotlinx.coroutines.flow.Flow
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.time.Instant

class TicketsRepository {

    suspend fun getActive(): List<MaintenanceTicket> =
        supabase.postgrest["maintenance_tickets"]
            .select {
                filter { neq("status", "cancelled") }
                order("created_at", Order.DESCENDING)
            }
            .decodeList()

    suspend fun create(roomNumber: String?, title: String, description: String?, priority: String) {
        val uid = supabase.auth.currentUserOrNull()?.id
        supabase.postgrest["maintenance_tickets"].insert(buildJsonObject {
            if (roomNumber != null) put("room_number", roomNumber)
            put("title", title)
            if (description != null) put("description", description)
            put("priority", priority)
            put("status", "open")
            if (uid != null) put("reported_by", uid)
        })
    }

    suspend fun updateStatus(ticketId: String, status: String, resolutionNotes: String? = null) {
        val now = Instant.now().toString()
        supabase.postgrest["maintenance_tickets"].update(buildJsonObject {
            put("status", status)
            put("updated_at", now)
            when (status) {
                "resolved"    -> {
                    put("resolved_at", now)
                    if (resolutionNotes != null) put("resolution_notes", resolutionNotes)
                }
                "in_progress" -> put("started_at", now)
            }
        }) { filter { eq("id", ticketId) } }
    }

    fun changes(): Flow<PostgresAction> {
        val channel = supabase.realtime.channel("tickets-android")
        return channel.postgresChangeFlow<PostgresAction>(schema = "public") {
            table = "maintenance_tickets"
        }
    }
}
