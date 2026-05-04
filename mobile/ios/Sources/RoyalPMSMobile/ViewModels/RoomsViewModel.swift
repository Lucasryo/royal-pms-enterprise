import Foundation
import Supabase

@MainActor
final class RoomsViewModel: ObservableObject {
    @Published var rooms: [Room] = []
    @Published var loading = false
    @Published var error: String?

    var roomsByFloor: [Int: [Room]] {
        Dictionary(grouping: rooms.filter { !$0.isVirtual }) { $0.floor }
    }

    func load() async {
        loading = true
        do {
            rooms = try await supabase
                .from("rooms")
                .select()
                .eq("is_virtual", value: false)
                .order("floor")
                .order("room_number")
                .execute()
                .value
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }

    func setHousekeepingStatus(room: Room, status: String, notes: String?) async {
        do {
            var patch: [String: String] = [
                "housekeeping_status": status,
                "updated_at": ISO8601DateFormatter().string(from: Date()),
            ]
            if status == "clean" || status == "inspected" {
                patch["last_cleaned_at"] = ISO8601DateFormatter().string(from: Date())
            }
            if let notes { patch["maintenance_notes"] = notes }

            try await supabase
                .from("rooms")
                .update(patch)
                .eq("id", value: room.id)
                .execute()
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }

    func toggleBlock(room: Room, notes: String?) async {
        let blocking = room.status != "maintenance"
        do {
            var patch: [String: String] = [
                "status": blocking ? "maintenance" : "available",
                "housekeeping_status": blocking ? "out_of_order" : "dirty",
                "updated_at": ISO8601DateFormatter().string(from: Date()),
            ]
            if let notes { patch["maintenance_notes"] = notes }

            try await supabase
                .from("rooms")
                .update(patch)
                .eq("id", value: room.id)
                .execute()
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
