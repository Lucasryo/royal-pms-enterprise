import SwiftUI

struct RoomsView: View {
    @ObservedObject var vm: RoomsViewModel
    @State private var selectedRoom: Room?

    var sortedFloors: [Int] {
        vm.roomsByFloor.keys.sorted()
    }

    var body: some View {
        NavigationStack {
            Group {
                if vm.loading && vm.rooms.isEmpty {
                    ProgressView("Carregando UHs...")
                } else {
                    List {
                        ForEach(sortedFloors, id: \.self) { floor in
                            Section("\(floor)o andar") {
                                ForEach(vm.roomsByFloor[floor] ?? []) { room in
                                    NavigationLink(destination: RoomDetailView(room: room, vm: vm)) {
                                        RoomRowView(room: room)
                                    }
                                }
                            }
                        }
                    }
                    .listStyle(.insetGrouped)
                    .refreshable { await vm.load() }
                }
            }
            .navigationTitle("Governanca")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { Task { await vm.load() } } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                }
            }
            .alert("Erro", isPresented: .constant(vm.error != nil)) {
                Button("OK") { vm.error = nil }
            } message: {
                Text(vm.error ?? "")
            }
        }
    }
}

struct RoomRowView: View {
    let room: Room

    var rowColor: Color {
        if room.isBlocked { return .red.opacity(0.08) }
        switch room.status {
        case "occupied": return Color(.systemGray5)
        case "reserved": return .orange.opacity(0.08)
        default:
            switch room.housekeepingStatus {
            case "dirty":    return .orange.opacity(0.06)
            case "clean", "inspected": return .green.opacity(0.06)
            default: return .clear
            }
        }
    }

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 3) {
                Text("UH \(room.roomNumber)")
                    .font(.headline)
                Text(room.category)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 4) {
                StatusPill(room.housekeepingLabel)
                if room.isBlocked { StatusPill("Bloqueada", color: .red) }
            }
        }
        .padding(.vertical, 4)
        .listRowBackground(rowColor)
    }
}

struct StatusPill: View {
    let label: String
    let color: Color

    init(_ label: String, color: Color = .secondary) {
        self.label = label
        self.color = color
    }

    var body: some View {
        Text(label)
            .font(.system(size: 10, weight: .black))
            .padding(.horizontal, 8)
            .padding(.vertical, 2)
            .background(color.opacity(0.14))
            .foregroundStyle(color)
            .clipShape(Capsule())
    }
}
