package com.royalpms.mobile

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.*
import com.royalpms.mobile.navigation.RoyalPMSNavigation
import com.royalpms.mobile.ui.screens.LoginScreen
import com.royalpms.mobile.ui.viewmodel.AuthViewModel

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            MaterialTheme {
                App()
            }
        }
    }
}

@Composable
private fun App() {
    val authVm = remember { AuthViewModel() }
    var authenticated by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        authVm.isAuthenticated.collect { authenticated = it }
    }

    if (authenticated) {
        RoyalPMSNavigation(authVm = authVm, onSignOut = { authVm.signOut() })
    } else {
        LoginScreen(vm = authVm, onSuccess = { authenticated = true })
    }
}
