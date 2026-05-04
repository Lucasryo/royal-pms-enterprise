import Foundation

struct UserProfile: Codable {
    let id: String
    let email: String
    let name: String
    let role: String
    let companyId: String?
    let phone: String?
    let photoUrl: String?

    enum CodingKeys: String, CodingKey {
        case id, email, name, role, phone
        case companyId = "company_id"
        case photoUrl  = "photo_url"
    }

    var canManageRooms: Bool {
        ["admin", "manager", "reception", "housekeeping", "maintenance"].contains(role)
    }

    var canManageTickets: Bool {
        ["admin", "manager", "maintenance", "reception"].contains(role)
    }
}
