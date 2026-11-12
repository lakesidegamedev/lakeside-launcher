// Verify a published release manifest against its detached Ed25519 signature.
//
//   cargo run --manifest-path src-tauri/Cargo.toml --example verify_manifest -- \
//     RTeyfbwD+bi3VP0eazWkQgeyzz/fLM7ePOaaAqH1xoE= \
//     /var/www/lakeside-landing/download/launcher/manifest.json.sig \
//     /var/www/lakeside-landing/download/launcher/manifest.json

use base64::Engine as _;
use ed25519_dalek::{Signature, VerifyingKey};
use std::{env, fs, process};

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() != 4 {
        eprintln!("usage: verify_manifest <public-key-base64> <signature-file> <manifest>");
        process::exit(2);
    }

    let engine = base64::engine::general_purpose::STANDARD;
    let key_bytes = engine.decode(args[1].trim()).expect("public key base64");
    let key_array: [u8; 32] = key_bytes.try_into().expect("public key length");
    let key = VerifyingKey::from_bytes(&key_array).expect("public key");

    let signature_bytes = engine
        .decode(fs::read_to_string(&args[2]).expect("signature file").trim())
        .expect("signature base64");
    let signature = Signature::from_slice(&signature_bytes).expect("signature length");

    let payload = fs::read(&args[3]).expect("manifest file");
    key.verify_strict(&payload, &signature)
        .expect("manifest signature did not verify");

    println!("manifest signature ok: {} ({} bytes)", args[3], payload.len());
}
