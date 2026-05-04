import SwiftUI

struct RoomDetailView: View {
    let room: Room
    @ObservedObject var vm: RoomsViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var notes: String
    @State private var confirming = false

    init(room: Room, vm: RoomsViewModel) {
        self.room = room
        self.vm = vm
        _notes = State(initialValue: room.maintenanceNotes ?? "")
    }

    var body: some View {
        Form {
            Section("Informacoes") {
                LabeledContent("Categoria", value: room.category)
                LabeledContent("Andar", value: "\(room.floor)o")
                LabeledContent("Status", value: room.statusLabel)
                LabeledContent("Governanca", value: room.housekeepingLabel)
            }

            Section("Observacoes") {
                TextField("Notas de manutencao", text: $notes, axis: .vertical)
                    .lineLimit(3...6)
            }

            Section("Atualizar governanca") {
                ForEach([
                    ("clean",     "Limpa",        "sparkles",        Color.blue),
                    ("inspected", "Inspecionada",  "checkmark.shield", Color.green),
                    ("dirty",     "Suja",          "paintbrush",       Color.orange),
                ], id: \.0) { status, label, icon, color in
                    Button {
                        Task {
                            await vm.setHousekeepingStatus(room: room, status: status,
                                                           notes: notes.isEmpty ? nil : notes)
                            dismiss()
                        }
                    } label: {
                        Label(label, systemImage: icon)
                            .foregroundStyle(color)
                    }
                }
            }

            Section {
                Button(role: room.isBlocked ? .none : .destructive) {
                    confirming = true
                } label: {
                    Label(
                        room.isBlocked ? "Liberar UH" : "Bloquear para Manutencao",
                        systemImage: room.isBlocked ? "lock.open" : "wrench"
                    )
                    .foregroundStyle(room.isBlocked ? .green : .red)
                }
            }
        }
        .navigationTitle("UH \(room.roomNumber)")
        .navigationBarTitleDisplayMode(.inline)
        .confirmationDialog(
            room.isBlocked ? "Liberar UH \(room.roomNumber)?" : "Bloquear UH \(room.roomNumber)?",
            isPresented: $confirming,
            titleVisibility: .visible,
        ) {
            Button(room.isBlocked ? "Liberar" : "Bloquear", role: room.isBlocked ? .none : .destructive) {
                Task {
                    await vm.toggleBlock(room: room, notes: notes.isEmpty ? nil : notes)
                    dismiss()
                }
            }
            Button("Cancelar", role: .cancel) {}
        }
    }
}
