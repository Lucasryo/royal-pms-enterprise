// swift-tools-version: 5.9
// Dependencias do projeto iOS — abra no Xcode (File > Add Package Dependencies).
// Crie um novo projeto SwiftUI iOS no Xcode, adicione os arquivos de Sources/
// e adicione esta dependencia:
//   https://github.com/supabase/supabase-swift  (from: "2.5.0")

import PackageDescription

let package = Package(
    name: "RoyalPMSMobile",
    platforms: [.iOS(.v16)],
    products: [
        .library(name: "RoyalPMSMobile", targets: ["RoyalPMSMobile"]),
    ],
    dependencies: [
        .package(url: "https://github.com/supabase/supabase-swift.git", from: "2.5.0"),
    ],
    targets: [
        .target(
            name: "RoyalPMSMobile",
            dependencies: [
                .product(name: "Supabase", package: "supabase-swift"),
            ],
            path: "Sources/RoyalPMSMobile"
        ),
    ]
)
