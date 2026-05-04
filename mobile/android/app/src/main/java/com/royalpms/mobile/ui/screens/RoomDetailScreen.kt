package com.royalpms.mobile.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.royalpms.mobile.data.models.Room
import com.royalpms.mobile.data.models.housekeepingLabel
import com.royalpms.mobile.data.models.isBlocked
import com.royalpms.mobile.data.models.statusLabel
import com.royalpms.mobile.ui.viewmodel.RoomsViewModel

@Composable
fun RoomDetailScreen(room: Room, vm: RoomsViewModel, onBack: () -> Unit) {
    var notes by remember { mutableStateOf(room.maintenanceNotes ?: "") }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("UH ${room.roomNumber}", fontWeight = FontWeight.Black) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Voltar")
                    }
                },
            )
        },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            InfoCard(room)

            OutlinedTextField(
                value = notes,
                onValueChange = { notes = it },
                label = { Text("Observacoes de manutencao") },
                modifier = Modifier.fillMaxWidth(),
                minLines = 3,
            )

            Text("Atualizar status", fontSize = 11.sp, fontWeight = FontWeight.Black,
                color = MaterialTheme.colorScheme.onSurfaceVariant)

            ActionButton("Limpa") {
                vm.setHousekeepingStatus(room, "clean", notes.ifBlank { null })
                onBack()
            }
            ActionButton("Suja") {
                vm.setHousekeepingStatus(room, "dirty", notes.ifBlank { null })
                onBack()
            }
            ActionButton("Inspecionada") {
                vm.setHousekeepingStatus(room, "inspected", notes.ifBlank { null })
                onBack()
            }

            HorizontalDivider()

            val blockLabel = if (room.isBlocked) "Liberar UH" else "Bloquear para Manutencao"
            val blockColors = if (room.isBlocked)
                ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary)
            else
                ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)

            Button(
                onClick = {
                    vm.toggleBlock(room, notes.ifBlank { null })
                    onBack()
                },
                colors = blockColors,
                modifier = Modifier.fillMaxWidth().height(52.dp),
                shape = RoundedCornerShape(12.dp),
            ) {
                Text(blockLabel, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun InfoCard(room: Room) {
    ElevatedCard(shape = RoundedCornerShape(16.dp)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            InfoRow("Categoria", room.category)
            InfoRow("Andar", "${room.floor}o")
            InfoRow("Status", room.statusLabel)
            InfoRow("Governanca", room.housekeepingLabel)
            if (!room.maintenanceNotes.isNullOrBlank()) InfoRow("Nota", room.maintenanceNotes)
        }
    }
}

@Composable
private fun InfoRow(label: String, value: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, fontSize = 12.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun ActionButton(label: String, onClick: () -> Unit) {
    OutlinedButton(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth().height(48.dp),
        shape = RoundedCornerShape(12.dp),
    ) { Text(label, fontWeight = FontWeight.Bold) }
}
