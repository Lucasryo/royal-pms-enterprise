import SwiftUI

struct LoginView: View {
    @EnvironmentObject var authVM: AuthViewModel
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            VStack(spacing: 6) {
                Text("Royal PMS")
                    .font(.system(size: 28, weight: .black))
                Text("Governanca & Manutencao")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            .padding(.bottom, 40)

            VStack(spacing: 14) {
                TextField("Email", text: $email)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .padding()
                    .background(Color(.systemGray6))
                    .clipShape(RoundedRectangle(cornerRadius: 14))

                SecureField("Senha", text: $password)
                    .padding()
                    .background(Color(.systemGray6))
                    .clipShape(RoundedRectangle(cornerRadius: 14))
            }

            if let error = authVM.error {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .padding(.top, 8)
            }

            Button {
                Task { await authVM.signIn(email: email, password: password) }
            } label: {
                Group {
                    if authVM.loading {
                        ProgressView().tint(.white)
                    } else {
                        Text("Entrar").fontWeight(.bold)
                    }
                }
                .frame(maxWidth: .infinity)
                .frame(height: 52)
            }
            .buttonStyle(.borderedProminent)
            .disabled(authVM.loading || email.isEmpty || password.isEmpty)
            .padding(.top, 24)

            Spacer()
        }
        .padding(.horizontal, 28)
    }
}
