import SwiftUI

struct TicketsView: View {
    @ObservedObject var vm: TicketsViewModel
    @State private var showNewTicket = false

    var body: some View {
        NavigationStack {
            Group {
                if vm.loading && vm.tickets.isEmpty {
                    ProgressView("Carregando chamados...")
                } else if vm.tickets.isEmpty {
                    ContentUnavailableView("Nenhum chamado ativo",
                                          systemImage: "checkmark.circle",
                                          description: Text("Todos os chamados foram resolvidos."))
                } else {
                    List(vm.sorted) { ticket in
                        TicketRowView(ticket: ticket, onUpdate: { status, notes in
                            Task { await vm.updateStatus(ticket: ticket, status: status, resolutionNotes: notes) }
                        })
                    }
                    .listStyle(.plain)
                    .refreshable { await vm.load() }
                }
            }
            .navigationTitle("Chamados")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showNewTicket = true } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showNewTicket) {
                NewTicketView(vm: vm, dismiss: { showNewTicket = false })
            }
            .alert("Erro", isPresented: .constant(vm.error != nil)) {
                Button("OK") { vm.error = nil }
            } message: {
                Text(vm.error ?? "")
            }
        }
    }
}

struct TicketRowView: View {
    let ticket: MaintenanceTicket
    let onUpdate: (String, String?) -> Void
    @State private var expanded = false
    @State private var resolutionNote = ""
    @State private var showResolve = false

    var priorityColor: Color {
        switch ticket.priority {
        case "urgent": return .red
        case "high":   return .orange
        case "medium": return .yellow
        default:       return .secondary
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text(ticket.title).font(.headline)
                    if let rn = ticket.roomNumber {
                        Text("UH \(rn)").font(.caption).foregroundStyle(.secondary)
                    }
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 4) {
                    StatusPill(ticket.priorityLabel, color: priorityColor)
                    StatusPill(ticket.statusLabel)
                }
            }

            if let desc = ticket.description, !desc.isEmpty {
                Text(desc).font(.caption).foregroundStyle(.secondary)
            }

            if ticket.status == "open" || ticket.status == "in_progress" {
                HStack(spacing: 10) {
                    if ticket.status == "open" {
                        Button("Iniciar") { onUpdate("in_progress", nil) }
                            .buttonStyle(.bordered)
                            .controlSize(.small)
                    }
                    Button("Resolver") { showResolve = true }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.small)
                }
            }
        }
        .padding(.vertical, 6)
        .sheet(isPresented: $showResolve) {
            ResolveSheet(note: $resolutionNote) {
                onUpdate("resolved", resolutionNote.isEmpty ? nil : resolutionNote)
                showResolve = false
            }
        }
    }
}

struct ResolveSheet: View {
    @Binding var note: String
    let onConfirm: () -> Void

    var body: some View {
        NavigationStack {
            Form {
                Section("Nota de resolucao (opcional)") {
                    TextField("Descreva como foi resolvido...", text: $note, axis: .vertical)
                        .lineLimit(3...6)
                }
            }
            .navigationTitle("Resolver Chamado")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Confirmar") { onConfirm() }
                        .fontWeight(.bold)
                }
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar", role: .cancel) {}
                }
            }
        }
        .presentationDetents([.medium])
    }
}
