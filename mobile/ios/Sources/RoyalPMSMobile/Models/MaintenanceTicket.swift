import Foundation

struct MaintenanceTicket: Identifiable, Codable {
    let id: String
    let roomId: String?
    let roomNumber: String?
    let title: String
    let description: String?
    let priority: String
    let status: String
    let assignedTo: String?
    let reportedBy: String?
    let dueAt: String?
    let startedAt: String?
    let resolvedAt: String?
    let resolutionNotes: String?
    let createdAt: String
    let updatedAt: String?

    enum CodingKeys: String, CodingKey {
        case id, title, description, priority, status
        case roomId         = "room_id"
        case roomNumber     = "room_number"
        case assignedTo     = "assigned_to"
        case reportedBy     = "reported_by"
        case dueAt          = "due_at"
        case startedAt      = "started_at"
        case resolvedAt     = "resolved_at"
        case resolutionNotes = "resolution_notes"
        case createdAt      = "created_at"
        case updatedAt      = "updated_at"
    }

    var priorityLabel: String {
        switch priority {
        case "low":    return "Baixa"
        case "medium": return "Media"
        case "high":   return "Alta"
        case "urgent": return "Urgente"
        default:       return priority
        }
    }

    var statusLabel: String {
        switch status {
        case "open":        return "Aberto"
        case "in_progress": return "Em andamento"
        case "resolved":    return "Resolvido"
        case "cancelled":   return "Cancelado"
        default:            return status
        }
    }

    static let priorityOrder = ["urgent", "high", "medium", "low"]
}
