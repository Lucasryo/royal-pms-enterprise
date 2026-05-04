package com.royalpms.mobile.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.royalpms.mobile.data.models.MaintenanceTicket
import com.royalpms.mobile.data.models.priorityLabel
import com.royalpms.mobile.data.models.statusLabel
import com.royalpms.mobile.ui.viewmodel.TicketsViewModel

@Composable
fun TicketsScreen(vm: TicketsViewModel, onNewTicket: () -> Unit) {
    val tickets by vm.tickets.collectAsState()
    val loading by vm.loading.collectAsState()
    val error by vm.error.collectAsState()

    val priorityOrder = listOf("urgent", "high", "medium", "low")
    val sorted = tickets.sortedWith(
        compareBy({ priorityOrder.indexOf(it.priority) }, { it.createdAt })
    )

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Chamados", fontWeight = FontWeight.Black) },
                actions = {
                    IconButton(onClick = { vm.load() }) {
                        Icon(Icons.Default.Refresh, contentDescription = "Atualizar")
                    }
                },
            )
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = onNewTicket,
                icon = { Icon(Icons.Default.Add, contentDescription = null) },
                text = { Text("Novo chamado") },
            )
        },
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            if (loading) {
                CircularProgressIndicator(Modifier.align(Alignment.Center))
            } else if (tickets.isEmpty()) {
                Text(
                    "Nenhum chamado ativo",
                    Modifier.align(Alignment.Center),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                LazyColumn(
                    contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 96.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    items(sorted, key = { it.id }) { ticket ->
                        TicketCard(ticket = ticket, onUpdate = { status, notes ->
                            vm.updateStatus(ticket, status, notes)
                        })
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
fun TicketCard(ticket: MaintenanceTicket, onUpdate: (String, String?) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    var resolveNote by remember { mutableStateOf("") }
    var showResolveInput by remember { mutableStateOf(false) }

    val priorityColor = when (ticket.priority) {
        "urgent" -> Color(0xFFDC2626)
        "high"   -> Color(0xFFEA580C)
        "medium" -> Color(0xFFD97706)
        else     -> Color(0xFF6B7280)
    }

    ElevatedCard(
        shape = RoundedCornerShape(16.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Column(Modifier.weight(1f)) {
                    Text(ticket.title, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                    if (!ticket.roomNumber.isNullOrBlank()) {
                        Text("UH ${ticket.roomNumber}", fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                PriorityBadge(ticket.priorityLabel, priorityColor)
            }

            if (!ticket.description.isNullOrBlank()) {
                Text(ticket.description, fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                StatusBadge(ticket.statusLabel)
            }

            if (ticket.status == "open") {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(
                        onClick = { onUpdate("in_progress", null) },
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(10.dp),
                    ) { Text("Iniciar", fontSize = 12.sp) }
                    Button(
                        onClick = { showResolveInput = !showResolveInput },
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(10.dp),
                    ) { Text("Resolver", fontSize = 12.sp) }
                }
            } else if (ticket.status == "in_progress") {
                Button(
                    onClick = { showResolveInput = !showResolveInput },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(10.dp),
                ) { Text("Marcar como Resolvido") }
            }

            if (showResolveInput) {
                OutlinedTextField(
                    value = resolveNote,
                    onValueChange = { resolveNote = it },
                    label = { Text("Nota de resolucao (opcional)") },
                    modifier = Modifier.fillMaxWidth(),
                )
                Button(
                    onClick = {
                        onUpdate("resolved", resolveNote.ifBlank { null })
                        showResolveInput = false
                    },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(10.dp),
                ) { Text("Confirmar Resolucao", fontWeight = FontWeight.Bold) }
            }
        }
    }
}

@Composable
private fun PriorityBadge(label: String, color: Color) {
    Surface(color = color.copy(alpha = 0.12f), shape = RoundedCornerShape(50)) {
        Text(label, Modifier.padding(horizontal = 10.dp, vertical = 3.dp),
            fontSize = 10.sp, fontWeight = FontWeight.Black, color = color)
    }
}

@Composable
private fun StatusBadge(label: String) {
    Surface(
        color = MaterialTheme.colorScheme.surfaceVariant,
        shape = RoundedCornerShape(50),
    ) {
        Text(label, Modifier.padding(horizontal = 10.dp, vertical = 3.dp),
            fontSize = 10.sp, fontWeight = FontWeight.Bold)
    }
}
