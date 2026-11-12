// Verify a published launcher artifact against the updater public key.
//
//   cargo run --manifest-path src-tauri/Cargo.toml --example verify_update -- \
//     /root/.tauri/lakeside-launcher.key.pub \
//     Lakeside_0.2.0_x64-setup.exe.sig \
//     Lakeside_0.2.0_x64-setup.exe
//
// Tauri writes the signature as base64 of a minisign document; plain minisign
// text is accepted too.

use base64::Engine;
use minisign_verify::{PublicKey, Signature};
use std::{env, fs, process};

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() != 4 {
        eprintln!("usage: verify_update <public-key-file> <signature-file> <artifact>");
        process::exit(2);
    }

    let raw_key = fs::read_to_string(&args[1]).expect("read public key");
    let key_text = if raw_key.trim_start().starts_with("untrusted comment:") {
        raw_key
    } else {
        let decoded = base64::engine::general_purpose::STANDARD
            .decode(raw_key.trim())
            .expect("decode base64 public key");
        String::from_utf8(decoded).expect("public key is not utf-8")
    };
    let public_key = PublicKey::decode(&key_text).expect("parse public key");
    let raw_signature = fs::read_to_string(&args[2]).expect("read signature");
    let signature_text = if raw_signature.trim_start().starts_with("untrusted comment:") {
        raw_signature
    } else {
        let decoded = base64::engine::general_purpose::STANDARD
            .decode(raw_signature.trim())
            .expect("decode base64 signature");
        String::from_utf8(decoded).expect("signature is not utf-8")
    };

    let signature = Signature::decode(&signature_text).expect("parse signature");
    let artifact = fs::read(&args[3]).expect("read artifact");
    public_key
        .verify(&artifact, &signature, false)
        .expect("signature verification failed");

    println!(
        "signature ok: {} ({} bytes)",
        args[3],
        artifact.len()
    );
}
