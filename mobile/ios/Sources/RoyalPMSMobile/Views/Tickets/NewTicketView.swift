import SwiftUI

struct NewTicketView: View {
    @ObservedObject var vm: TicketsViewModel
    let dismiss: () -> Void

    @State private var title = ""
    @State private var roomNumber = ""
    @State private var description = ""
    @State private var priority = "medium"

    let priorities = [("low", "Baixa"), ("medium", "Media"), ("high", "Alta"), ("urgent", "Urgente")]

    var body: some View {
        NavigationStack {
            Form {
                Section("Chamado") {
                    TextField("Titulo *", text: $title)
                    TextField("Numero da UH (opcional)", text: $roomNumber)
                        .keyboardType(.numberPad)
                }

                Section("Descricao") {
                    TextField("Detalhe o problema...", text: $description, axis: .vertical)
                        .lineLimit(3...6)
                }

                Section("Prioridade") {
                    Picker("Prioridade", selection: $priority) {
                        ForEach(priorities, id: \.0) { value, label in
                            Text(label).tag(value)
                        }
                    }
                    .pickerStyle(.segmented)
                }
            }
            .navigationTitle("Novo Chamado")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Abrir") {
                        Task {
                            await vm.createTicket(
                                roomNumber: roomNumber.isEmpty ? nil : roomNumber,
                                title: title,
                                description: description.isEmpty ? nil : description,
                                priority: priority
                            )
                            dismiss()
                        }
                    }
                    .fontWeight(.bold)
                    .disabled(title.isEmpty)
                }
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar", role: .cancel) { dismiss() }
                }
            }
        }
    }
}
