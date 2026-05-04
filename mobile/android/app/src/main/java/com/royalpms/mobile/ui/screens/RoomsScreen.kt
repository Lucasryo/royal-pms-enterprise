package com.royalpms.mobile.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.royalpms.mobile.data.models.Room
import com.royalpms.mobile.data.models.housekeepingLabel
import com.royalpms.mobile.data.models.isBlocked
import com.royalpms.mobile.data.models.statusLabel
import com.royalpms.mobile.ui.viewmodel.RoomsViewModel

@Composable
fun RoomsScreen(vm: RoomsViewModel, onRoomClick: (Room) -> Unit) {
    val rooms by vm.rooms.collectAsState()
    val loading by vm.loading.collectAsState()
    val error by vm.error.collectAsState()

    val byFloor = rooms.groupBy { it.floor }.toSortedMap()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Governanca", fontWeight = FontWeight.Black) },
                actions = {
                    IconButton(onClick = { vm.load() }) {
                        Icon(Icons.Default.Refresh, contentDescription = "Atualizar")
                    }
                },
            )
        },
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            if (loading) {
                CircularProgressIndicator(Modifier.align(Alignment.Center))
            } else {
                LazyColumn(
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    byFloor.forEach { (floor, floorRooms) ->
                        item {
                            Text(
                                "${floor}o andar — ${floorRooms.size} UHs",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Black,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(top = 8.dp, bottom = 4.dp),
                            )
                        }
                        items(floorRooms, key = { it.id }) { room ->
                            RoomCard(room = room, onClick = { onRoomClick(room) })
                        }
                    }
                }
            }

            if (error != null) {
                Snackbar(
                    modifier = Modifier.align(Alignment.BottomCenter).padding(16.dp),
                    action = { TextButton(onClick = { vm.clearError() }) { Text("OK") } },
                ) { Text(error!!) }
            }
        }
    }
}

@Composable
fun RoomCard(room: Room, onClick: () -> Unit) {
    val (bgColor, textColor) = when {
        room.isBlocked              -> Color(0xFFFEE2E2) to Color(0xFFB91C1C)
        room.status == "occupied"   -> Color(0xFF171717) to Color.White
        room.status == "reserved"   -> Color(0xFFFFFBEB) to Color(0xFF92400E)
        room.housekeepingStatus == "dirty" -> Color(0xFFFFF7ED) to Color(0xFF9A3412)
        room.housekeepingStatus == "clean" || room.housekeepingStatus == "inspected" ->
            Color(0xFFECFDF5) to Color(0xFF065F46)
        else                        -> Color(0xFFF5F5F5) to Color(0xFF404040)
    }

    Card(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = bgColor),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
    ) {
        Row(
            Modifier.padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column {
                Text("UH ${room.roomNumber}", fontWeight = FontWeight.Black, fontSize = 16.sp, color = textColor)
                Text("${room.category} · ${room.floor}o andar", fontSize = 11.sp, color = textColor.copy(alpha = 0.7f))
            }
            Column(horizontalAlignment = Alignment.End) {
                StatusChip(room.housekeepingLabel, textColor)
                if (room.isBlocked) StatusChip("Bloqueada", Color(0xFF991B1B))
            }
        }
    }
}

@Composable
private fun StatusChip(label: String, color: Color) {
    Box(
        Modifier
            .padding(top = 2.dp)
            .background(color.copy(alpha = 0.15f), RoundedCornerShape(50))
            .padding(horizontal = 8.dp, vertical = 2.dp),
    ) {
        Text(label, fontSize = 9.sp, fontWeight = FontWeight.Black, color = color)
    }
}
