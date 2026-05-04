import Foundation

struct Room: Identifiable, Codable, Equatable {
    let id: String
    let roomNumber: String
    let floor: Int
    let category: String
    let seaView: Bool
    let status: String
    let housekeepingStatus: String
    let maintenanceNotes: String?
    let lastCleanedAt: String?
    let isVirtual: Bool
    let updatedAt: String?

    enum CodingKeys: String, CodingKey {
        case id, floor, category, status
        case roomNumber       = "room_number"
        case seaView          = "sea_view"
        case housekeepingStatus = "housekeeping_status"
        case maintenanceNotes = "maintenance_notes"
        case lastCleanedAt    = "last_cleaned_at"
        case isVirtual        = "is_virtual"
        case updatedAt        = "updated_at"
    }

    var isBlocked: Bool {
        status == "maintenance" || housekeepingStatus == "out_of_order"
    }

    var statusLabel: String {
        switch status {
        case "available":   return "Disponivel"
        case "occupied":    return "Ocupada"
        case "maintenance": return "Manutencao"
        case "reserved":    return "Reservada"
        default:            return status
        }
    }

    var housekeepingLabel: String {
        switch housekeepingStatus {
        case "clean":       return "Limpa"
        case "dirty":       return "Suja"
        case "inspected":   return "Inspecionada"
        case "out_of_order": return "Bloqueada"
        default:            return housekeepingStatus
        }
    }
}
