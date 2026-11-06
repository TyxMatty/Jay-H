//! The Jay apps: installed version, install/update and open (docs/ARQUITETURA.md, sections 1 and 3).
//! The page only names a product by its id; URLs and paths come from the catalog and the registry.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use std::fs;
use tauri::ipc::Channel;

/// No Jay installer comes near this (Jay-C 0.4.0: 2.3 MB; Jay-A plans up to 20 MB).
const MAX_INSTALLER: u64 = 200 * 1024 * 1024;

#[derive(Deserialize)]
struct Product {
    id: String,
    name: String,
    repo: String,
    exe: String,
}

/// The catalog the page uses too.
fn catalog() -> Vec<Product> {
    serde_json::from_str(include_str!("../../src/core/products.json")).expect("a valid products.json")
}

fn product(id: &str) -> Result<Product, String> {
    catalog().into_iter().find(|p| p.id == id).ok_or_else(|| format!("unknown product: {id}"))
}

/// An app installed by its NSIS installer.
#[derive(Serialize)]
pub struct Installed {
    version: String,
    location: String,
}

/// Version and folder of the installed product, or None.
// shortcut: only per-user installs (HKCU), which is how the Jay installers install; add HKLM if one
// ever installs per machine.
fn installed(name: &str) -> Result<Option<Installed>, String> {
    #[cfg(windows)]
    {
        use winreg::{RegKey, enums::HKEY_CURRENT_USER};
        let path = format!(r"Software\Microsoft\Windows\CurrentVersion\Uninstall\{name}");
        let Ok(key) = RegKey::predef(HKEY_CURRENT_USER).open_subkey(path) else {
            return Ok(None);
        };
        let version: String = key.get_value("DisplayVersion").map_err(|e| e.to_string())?;
        let location: String = key.get_value("InstallLocation").unwrap_or_default();
        // NSIS stores the folder in quotes.
        Ok(Some(Installed { version, location: location.trim_matches('"').to_owned() }))
    }
    #[cfg(not(windows))]
    {
        let _ = name;
        Ok(None)
    }
}

#[tauri::command]
pub fn installed_app(id: String) -> Result<Option<Installed>, String> {
    installed(&product(&id)?.name)
}

#[tauri::command]
pub fn open_app(id: String) -> Result<(), String> {
    let product = product(&id)?;
    let app = installed(&product.name)?.ok_or_else(|| format!("{} isn't installed", product.name))?;
    Command::new(Path::new(&app.location).join(&product.exe))
        .current_dir(&app.location)
        .spawn()
        .map(drop)
        .map_err(|e| e.to_string())
}

#[derive(Deserialize)]
struct Release {
    assets: Vec<Asset>,
}

#[derive(Deserialize)]
struct Asset {
    name: String,
    size: u64,
    browser_download_url: String,
    digest: Option<String>,
}

/// The release's x64 installer and its SHA-256, after the checks of docs/ARQUITETURA.md, section 3.
fn pick_installer(release: Release, repo: &str) -> Result<(Asset, String), String> {
    let asset = release
        .assets
        .into_iter()
        .find(|a| a.name.ends_with("_x64-setup.exe"))
        .ok_or("the latest release has no Windows installer")?;
    if !asset.browser_download_url.starts_with(&format!("https://github.com/{repo}/releases/download/")) {
        return Err(format!("unexpected download address: {}", asset.browser_download_url));
    }
    if asset.name.contains(['/', '\\', ':']) || asset.size > MAX_INSTALLER {
        return Err(format!("unexpected installer: {} ({} bytes)", asset.name, asset.size));
    }
    let sha256 = asset
        .digest
        .as_deref()
        .and_then(|d| d.strip_prefix("sha256:"))
        .filter(|h| h.len() == 64 && h.bytes().all(|b| b.is_ascii_hexdigit()))
        .ok_or("the installer has no SHA-256 on GitHub, so it can't be checked")?
        .to_ascii_lowercase();
    Ok((asset, sha256))
}

/// Copies `from` into `to` and returns its SHA-256 (lowercase hex) and length. Fails past `limit` bytes.
fn copy_hashed(mut from: impl Read, mut to: impl Write, limit: u64, mut progress: impl FnMut(u64)) -> io::Result<(String, u64)> {
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 64 * 1024];
    let mut total = 0u64;
    loop {
        let n = from.read(&mut buf)?;
        if n == 0 {
            break;
        }
        total += n as u64;
        if total > limit {
            return Err(io::Error::other("the download is bigger than GitHub said"));
        }
        hasher.update(&buf[..n]);
        to.write_all(&buf[..n])?;
        progress(total);
    }
    to.flush()?;
    Ok((hasher.finalize().iter().map(|b| format!("{b:02x}")).collect(), total))
}

fn get(url: &str) -> Result<ureq::http::Response<ureq::Body>, String> {
    // GitHub's API refuses requests without a User-Agent.
    ureq::get(url).header("User-Agent", "Jay-H").call().map_err(|e| e.to_string())
}

/// Downloads the latest installer of `product` into a new temporary folder and checks its SHA-256.
/// On any failure the folder is removed.
fn download_installer(product: &Product, mut progress: impl FnMut(u64, u64)) -> Result<PathBuf, String> {
    let release: Release = get(&format!("https://api.github.com/repos/{}/releases/latest", product.repo))?
        .body_mut()
        .read_json()
        .map_err(|e| e.to_string())?;
    let (asset, sha256) = pick_installer(release, &product.repo)?;

    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_nanos());
    let dir = std::env::temp_dir().join(format!("jay-h-{}-{nanos}", std::process::id()));
    fs::create_dir(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(&asset.name);
    let result = (|| {
        let mut response = get(&asset.browser_download_url)?;
        // ureq stops bodies at 10 MB by default.
        let body = response.body_mut().with_config().limit(asset.size + 1).reader();
        let file = fs::File::create(&path).map_err(|e| e.to_string())?;
        let (got, len) = copy_hashed(body, file, asset.size, |done| progress(done, asset.size)).map_err(|e| e.to_string())?;
        if len != asset.size || got != sha256 {
            return Err(format!("{} doesn't match GitHub's SHA-256; it was not run", asset.name));
        }
        Ok(path)
    })();
    if result.is_err() {
        let _ = fs::remove_dir_all(&dir);
    }
    result
}

#[derive(Clone, Serialize)]
#[serde(tag = "stage", rename_all = "camelCase")]
pub enum Progress {
    Download { done: u64, total: u64 },
    /// The installer's window is open; the user finishes there.
    Installer,
}

static BUSY: AtomicBool = AtomicBool::new(false);

/// One install at a time: two installers would fight over the same files.
struct Busy;

impl Busy {
    fn take() -> Result<Self, String> {
        if BUSY.swap(true, Ordering::SeqCst) { Err("another install is running".into()) } else { Ok(Busy) }
    }
}

impl Drop for Busy {
    fn drop(&mut self) {
        BUSY.store(false, Ordering::SeqCst);
    }
}

/// Downloads, checks and runs the latest installer of the product. Returns the installer's exit code
/// (0 = installed; NSIS uses 1 for cancelled).
#[tauri::command]
pub async fn install_app(id: String, on_progress: Channel<Progress>) -> Result<i32, String> {
    let busy = Busy::take()?;
    tauri::async_runtime::spawn_blocking(move || {
        let _busy = busy;
        let product = product(&id)?;
        let mut last = u64::MAX;
        let path = download_installer(&product, |done, total| {
            // One message per percent is plenty.
            let percent = done * 100 / total.max(1);
            if percent != last {
                last = percent;
                let _ = on_progress.send(Progress::Download { done, total });
            }
        })?;
        let _ = on_progress.send(Progress::Installer);
        let status = Command::new(&path).status();
        if let Some(dir) = path.parent() {
            let _ = fs::remove_dir_all(dir);
        }
        status.map(|s| s.code().unwrap_or(-1)).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn jay_c_release(url: &str, digest: Option<&str>) -> Release {
        Release {
            assets: vec![Asset {
                name: "Jay-C_0.4.0_x64-setup.exe".into(),
                size: 2302415,
                browser_download_url: url.into(),
                digest: digest.map(Into::into),
            }],
        }
    }

    const URL: &str = "https://github.com/TyxMatty/Jay-C/releases/download/v0.4.0/Jay-C_0.4.0_x64-setup.exe";
    const DIGEST: &str = "sha256:848005e8a2f42200b36f5553fd144a9d8aefdcbddbbf1ad49b56c65f473d63de";

    #[test]
    fn catalog_is_valid() {
        let products = catalog();
        assert!(products.iter().any(|p| p.id == "jay-c" && p.repo == "TyxMatty/Jay-C" && p.exe == "jay-c.exe"));
        for p in &products {
            // The name becomes a registry path and the exe a file name.
            assert!(p.name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-'), "{}", p.name);
            assert!(p.repo.starts_with("TyxMatty/") && !p.exe.contains(['/', '\\']), "{}", p.id);
            assert_eq!(products.iter().filter(|q| q.id == p.id).count(), 1, "duplicate {}", p.id);
        }
        assert!(product("nope").is_err());
    }

    #[test]
    fn pick_installer_checks_address_and_digest() {
        let (asset, sha) = pick_installer(jay_c_release(URL, Some(DIGEST)), "TyxMatty/Jay-C").unwrap();
        assert_eq!(asset.name, "Jay-C_0.4.0_x64-setup.exe");
        assert_eq!(sha, &DIGEST[7..]);
        // Another repository's file, no digest, a malformed digest.
        assert!(pick_installer(jay_c_release(URL, Some(DIGEST)), "TyxMatty/Jay-A").is_err());
        assert!(pick_installer(jay_c_release("https://example.com/TyxMatty/Jay-C/releases/download/x.exe", Some(DIGEST)), "TyxMatty/Jay-C").is_err());
        assert!(pick_installer(jay_c_release(URL, None), "TyxMatty/Jay-C").is_err());
        assert!(pick_installer(jay_c_release(URL, Some("sha256:abc")), "TyxMatty/Jay-C").is_err());
        assert!(pick_installer(Release { assets: vec![] }, "TyxMatty/Jay-C").is_err());
    }

    #[test]
    fn copy_hashed_hashes_and_limits() {
        let mut out = Vec::new();
        let mut seen = 0;
        let (sha, len) = copy_hashed(&b"abc"[..], &mut out, 3, |n| seen = n).unwrap();
        assert_eq!(sha, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
        assert_eq!((len, seen, out.as_slice()), (3, 3, &b"abc"[..]));
        assert!(copy_hashed(&b"abcd"[..], Vec::new(), 3, |_| {}).is_err());
    }

    /// The real thing, without running it: `cargo test -- --ignored` (downloads Jay-C's installer).
    #[test]
    #[ignore]
    fn downloads_and_checks_jay_c() {
        let mut calls = 0;
        let path = download_installer(&product("jay-c").unwrap(), |_, _| calls += 1).unwrap();
        let size = fs::metadata(&path).unwrap().len();
        fs::remove_dir_all(path.parent().unwrap()).unwrap();
        assert!(size > 1_000_000 && calls > 0, "{size} bytes, {calls} progress calls");
    }
}
