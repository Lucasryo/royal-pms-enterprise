package com.royalpms.mobile.data.models

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class UserProfile(
    val id: String,
    val email: String,
    val name: String,
    val role: String,
    @SerialName("company_id") val companyId: String? = null,
    val phone: String? = null,
    @SerialName("photo_url") val photoUrl: String? = null,
)

val UserProfile.canManageRooms get() =
    role in listOf("admin", "manager", "reception", "housekeeping", "maintenance")

val UserProfile.canManageTickets get() =
    role in listOf("admin", "manager", "maintenance", "reception")
