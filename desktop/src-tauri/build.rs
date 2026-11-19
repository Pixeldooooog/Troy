fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        println!("cargo:rerun-if-changed=src/macos_residency.m");
        cc::Build::new()
            .file("src/macos_residency.m")
            .compile("troy_residency");
    }
    tauri_build::build()
}
