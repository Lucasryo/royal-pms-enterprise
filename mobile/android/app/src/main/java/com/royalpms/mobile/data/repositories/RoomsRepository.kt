package com.royalpms.mobile.data.repositories

import com.royalpms.mobile.data.models.Room
import com.royalpms.mobile.data.supabase
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.realtime.PostgresAction
import io.github.jan.supabase.realtime.channel
import io.github.jan.supabase.realtime.postgresChangeFlow
import io.github.jan.supabase.realtime.realtime
import kotlinx.coroutines.flow.Flow
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.time.Instant

class RoomsRepository {

    suspend fun getAll(): List<Room> =
        supabase.postgrest["rooms"]
            .select {
                filter { eq("is_virtual", false) }
                order("floor")
                order("room_number")
            }
            .decodeList()

    suspend fun updateHousekeepingStatus(roomId: String, status: String, notes: String?) {
        val now = Instant.now().toString()
        supabase.postgrest["rooms"].update(buildJsonObject {
            put("housekeeping_status", status)
            put("updated_at", now)
            if (status == "clean" || status == "inspected") put("last_cleaned_at", now)
            if (notes != null) put("maintenance_notes", notes)
        }) { filter { eq("id", roomId) } }
    }

    suspend fun toggleBlock(room: Room, notes: String?) {
        val blocking = room.status != "maintenance"
        val now = Instant.now().toString()
        supabase.postgrest["rooms"].update(buildJsonObject {
            put("status", if (blocking) "maintenance" else "available")
            put("housekeeping_status", if (blocking) "out_of_order" else "dirty")
            put("updated_at", now)
            if (notes != null) put("maintenance_notes", notes)
        }) { filter { eq("id", room.id) } }
    }

    fun changes(): Flow<PostgresAction> {
        val channel = supabase.realtime.channel("rooms-android")
        return channel.postgresChangeFlow<PostgresAction>(schema = "public") {
            table = "rooms"
        }
    }
}
