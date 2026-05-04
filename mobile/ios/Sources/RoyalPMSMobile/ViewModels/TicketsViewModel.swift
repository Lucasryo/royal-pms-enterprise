import Foundation
import Supabase

@MainActor
final class TicketsViewModel: ObservableObject {
    @Published var tickets: [MaintenanceTicket] = []
    @Published var loading = false
    @Published var error: String?

    var sorted: [MaintenanceTicket] {
        tickets.sorted {
            let a = MaintenanceTicket.priorityOrder.firstIndex(of: $0.priority) ?? 99
            let b = MaintenanceTicket.priorityOrder.firstIndex(of: $1.priority) ?? 99
            return a < b
        }
    }

    func load() async {
        loading = true
        do {
            tickets = try await supabase
                .from("maintenance_tickets")
                .select()
                .neq("status", value: "cancelled")
                .order("created_at", ascending: false)
                .execute()
                .value
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }

    func createTicket(roomNumber: String?, title: String, description: String?, priority: String) async {
        do {
            var body: [String: String] = ["title": title, "priority": priority, "status": "open"]
            if let rn = roomNumber, !rn.isEmpty { body["room_number"] = rn }
            if let desc = description, !desc.isEmpty { body["description"] = desc }
            if let uid = try? await supabase.auth.session.user.id.uuidString {
                body["reported_by"] = uid
            }
            try await supabase.from("maintenance_tickets").insert(body).execute()
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }

    func updateStatus(ticket: MaintenanceTicket, status: String, resolutionNotes: String? = nil) async {
        do {
            let now = ISO8601DateFormatter().string(from: Date())
            var patch: [String: String] = ["status": status, "updated_at": now]
            switch status {
            case "resolved":
                patch["resolved_at"] = now
                if let notes = resolutionNotes, !notes.isEmpty { patch["resolution_notes"] = notes }
            case "in_progress":
                patch["started_at"] = now
            default: break
            }
            try await supabase
                .from("maintenance_tickets")
                .update(patch)
                .eq("id", value: ticket.id)
                .execute()
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
