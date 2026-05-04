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
import com.royalpms.mobile.ui.viewmodel.TicketsViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NewTicketScreen(vm: TicketsViewModel, onBack: () -> Unit) {
    var title by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var roomNumber by remember { mutableStateOf("") }
    var priority by remember { mutableStateOf("medium") }
    var priorityExpanded by remember { mutableStateOf(false) }

    val priorities = listOf("low" to "Baixa", "medium" to "Media", "high" to "Alta", "urgent" to "Urgente")

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Novo Chamado", fontWeight = FontWeight.Black) },
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
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            OutlinedTextField(
                value = title,
                onValueChange = { title = it },
                label = { Text("Titulo do chamado *") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )

            OutlinedTextField(
                value = roomNumber,
                onValueChange = { roomNumber = it },
                label = { Text("Numero da UH (opcional)") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )

            OutlinedTextField(
                value = description,
                onValueChange = { description = it },
                label = { Text("Descricao") },
                modifier = Modifier.fillMaxWidth(),
                minLines = 3,
            )

            ExposedDropdownMenuBox(
                expanded = priorityExpanded,
                onExpandedChange = { priorityExpanded = it },
            ) {
                OutlinedTextField(
                    value = priorities.find { it.first == priority }?.second ?: "",
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Prioridade") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(priorityExpanded) },
                    modifier = Modifier.fillMaxWidth().menuAnchor(),
                )
                ExposedDropdownMenu(
                    expanded = priorityExpanded,
                    onDismissRequest = { priorityExpanded = false },
                ) {
                    priorities.forEach { (value, label) ->
                        DropdownMenuItem(
                            text = { Text(label) },
                            onClick = { priority = value; priorityExpanded = false },
                        )
                    }
                }
            }

            Spacer(Modifier.weight(1f))

            Button(
                onClick = {
                    vm.createTicket(
                        roomNumber = roomNumber.ifBlank { null },
                        title = title,
                        description = description.ifBlank { null },
                        priority = priority,
                        onDone = onBack,
                    )
                },
                enabled = title.isNotBlank(),
                modifier = Modifier.fillMaxWidth().height(52.dp),
                shape = RoundedCornerShape(14.dp),
            ) {
                Text("Abrir Chamado", fontWeight = FontWeight.Bold)
            }
        }
    }
}
