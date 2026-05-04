import SwiftUI

struct MainTabView: View {
    @EnvironmentObject var authVM: AuthViewModel
    @StateObject private var roomsVM = RoomsViewModel()
    @StateObject private var ticketsVM = TicketsViewModel()

    var body: some View {
        TabView {
            RoomsView(vm: roomsVM)
                .tabItem { Label("Governanca", systemImage: "bed.double") }

            TicketsView(vm: ticketsVM)
                .tabItem { Label("Chamados", systemImage: "wrench.and.screwdriver") }
        }
        .task {
            await roomsVM.load()
            await ticketsVM.load()
        }
    }
}
