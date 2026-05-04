package com.royalpms.mobile.navigation

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.BedDouble
import androidx.compose.material.icons.filled.Build
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.navigation.NavType
import androidx.navigation.compose.*
import androidx.navigation.navArgument
import com.royalpms.mobile.data.models.Room
import com.royalpms.mobile.ui.screens.*
import com.royalpms.mobile.ui.viewmodel.AuthViewModel
import com.royalpms.mobile.ui.viewmodel.RoomsViewModel
import com.royalpms.mobile.ui.viewmodel.TicketsViewModel

sealed class Screen(val route: String, val label: String, val icon: ImageVector) {
    object Rooms   : Screen("rooms", "Governanca", Icons.Default.BedDouble)
    object Tickets : Screen("tickets", "Chamados",  Icons.Default.Build)
}

@Composable
fun RoyalPMSNavigation(authVm: AuthViewModel, onSignOut: () -> Unit) {
    val navController = rememberNavController()
    val roomsVm   = remember { RoomsViewModel() }
    val ticketsVm = remember { TicketsViewModel() }
    val rooms by roomsVm.rooms.collectAsState()

    val navItems = listOf(Screen.Rooms, Screen.Tickets)
    val backStack by navController.currentBackStackEntryAsState()
    val currentRoute = backStack?.destination?.route

    val showBottomBar = currentRoute in listOf(Screen.Rooms.route, Screen.Tickets.route)

    Scaffold(
        bottomBar = {
            if (showBottomBar) {
                NavigationBar {
                    navItems.forEach { screen ->
                        NavigationBarItem(
                            selected = currentRoute == screen.route,
                            onClick = {
                                navController.navigate(screen.route) {
                                    popUpTo(navController.graph.startDestinationId) { saveState = true }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                            icon = { Icon(screen.icon, contentDescription = screen.label) },
                            label = { Text(screen.label) },
                        )
                    }
                }
            }
        },
    ) { _ ->
        NavHost(navController = navController, startDestination = Screen.Rooms.route) {
            composable(Screen.Rooms.route) {
                RoomsScreen(vm = roomsVm) { room ->
                    navController.navigate("room_detail/${room.id}")
                }
            }
            composable(
                "room_detail/{roomId}",
                arguments = listOf(navArgument("roomId") { type = NavType.StringType }),
            ) { backStack ->
                val roomId = backStack.arguments?.getString("roomId")
                val room = rooms.find { it.id == roomId }
                if (room != null) {
                    RoomDetailScreen(room = room, vm = roomsVm, onBack = { navController.popBackStack() })
                }
            }
            composable(Screen.Tickets.route) {
                TicketsScreen(vm = ticketsVm) {
                    navController.navigate("new_ticket")
                }
            }
            composable("new_ticket") {
                NewTicketScreen(vm = ticketsVm, onBack = { navController.popBackStack() })
            }
        }
    }
}
