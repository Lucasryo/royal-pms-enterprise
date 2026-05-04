# Royal PMS Mobile

Apps nativos de **Governanca** e **Manutencao** para o Royal PMS Enterprise.

| Plataforma | Linguagem | UI Toolkit |
|------------|-----------|-----------|
| Android    | Kotlin    | Jetpack Compose + Material 3 |
| iOS        | Swift     | SwiftUI |

Ambos conectam ao mesmo backend Supabase do PMS web, usando autenticacao e Realtime compartilhados.

---

## Funcionalidades

### Aba Governanca
- Mapa de UHs agrupado por andar com codigo de cor de status
- Atualizar status: Limpa / Suja / Inspecionada
- Bloquear / Liberar UH para manutencao (reflete em tempo real na recepcao)
- Campo de observacoes de manutencao

### Aba Chamados (Manutencao)
- Lista de chamados ativos ordenados por prioridade
- Criar novo chamado com titulo, UH, descricao e prioridade
- Atualizar status: Aberto → Em andamento → Resolvido
- Nota de resolucao ao fechar chamado

---

## Android — Setup

### Pre-requisitos
- Android Studio Ladybug (2024.2+)
- JDK 17+
- Dispositivo ou emulador API 26+

### Passos

1. Abra `mobile/android/` no Android Studio como projeto raiz.

2. Crie `mobile/android/local.properties` com suas credenciais:
   ```properties
   sdk.dir=/caminho/para/seu/android-sdk
   SUPABASE_URL=https://xxxx.supabase.co
   SUPABASE_ANON_KEY=eyJhbGci...
   ```

3. Sincronize o Gradle e execute em um dispositivo/emulador.

### Estrutura
```
android/app/src/main/java/com/royalpms/mobile/
├── data/
│   ├── SupabaseClient.kt          # Cliente Supabase singleton
│   ├── models/                    # Room, MaintenanceTicket, UserProfile
│   └── repositories/              # AuthRepository, RoomsRepository, TicketsRepository
├── ui/
│   ├── viewmodel/                 # AuthViewModel, RoomsViewModel, TicketsViewModel
│   └── screens/                   # LoginScreen, RoomsScreen, RoomDetailScreen,
│                                  # TicketsScreen, NewTicketScreen
├── navigation/
│   └── Navigation.kt              # NavHost + BottomBar
└── MainActivity.kt
```

---

## iOS — Setup

### Pre-requisitos
- Xcode 15+
- macOS Ventura+
- iOS 16+ (simulator ou dispositivo fisico)

### Passos

1. Abra Xcode → **File > New > Project** → escolha **App** (SwiftUI, iOS).

2. Adicione o pacote Supabase via **File > Add Package Dependencies**:
   ```
   https://github.com/supabase/supabase-swift
   ```
   Versao minima: `2.5.0`. Adicione o produto **Supabase** ao target.

3. Arraste todos os arquivos de `mobile/ios/Sources/RoyalPMSMobile/` para o projeto no Xcode.

4. Configure as variaveis de ambiente no scheme do Xcode (**Product > Scheme > Edit Scheme > Run > Arguments > Environment Variables**):
   ```
   SUPABASE_URL     = https://xxxx.supabase.co
   SUPABASE_ANON_KEY = eyJhbGci...
   ```
   Em producao, use um `Config.plist` com as chaves e leia via `Bundle.main.infoDictionary`.

5. Build & Run no simulador ou dispositivo.

### Estrutura
```
Sources/RoyalPMSMobile/
├── App/
│   └── RoyalPMSApp.swift          # Entry point @main
├── Services/
│   └── SupabaseService.swift      # Cliente Supabase
├── Models/
│   ├── Room.swift
│   ├── MaintenanceTicket.swift
│   └── UserProfile.swift
├── ViewModels/
│   ├── AuthViewModel.swift
│   ├── RoomsViewModel.swift
│   └── TicketsViewModel.swift
└── Views/
    ├── LoginView.swift
    ├── MainTabView.swift
    ├── Rooms/
    │   ├── RoomsView.swift
    │   └── RoomDetailView.swift
    └── Tickets/
        ├── TicketsView.swift
        └── NewTicketView.swift
```

---

## Usuarios e permissoes

Os apps respeitam os perfis de acesso do PMS web:

| Role           | Governanca | Chamados |
|----------------|-----------|----------|
| housekeeping   | Leitura + update | Somente leitura |
| maintenance    | Leitura + bloquear/liberar | Leitura + criar + resolver |
| reception      | Completo  | Completo |
| admin / manager | Completo | Completo |

---

## Proximos passos sugeridos

- [ ] Push notifications (FCM no Android, APNs no iOS) quando um novo chamado for aberto
- [ ] Scanner QR Code para identificar UH automaticamente
- [ ] Upload de fotos no chamado (Supabase Storage)
- [ ] Suporte offline com sincronizacao quando reconectar
- [ ] Widget de UHs bloqueadas para tela inicial do Android
