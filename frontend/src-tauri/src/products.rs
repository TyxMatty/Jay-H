//! The Jay apps: installed version, install/update and open (docs/ARQUITETURA.md, sections 1 and 3).
//! The page only names a product by its id; URLs and paths come from the catalog and the registry.
//! Release lookup, installer checks, download and registry reading live in the shared `jay-i` crate.

use jay_i::Mode;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::ipc::Channel;

const AGENT: &str = concat!("Jay-H/", env!("CARGO_PKG_VERSION"));

/// Jay-H's own id in the catalog (core/products.js, SELF_ID).
const SELF_ID: &str = "jay-h";

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

/// An installed app, as the page gets it (jay_i::Installed isn't Serialize).
#[derive(Serialize)]
pub struct Installed {
    version: String,
    location: String,
}

#[tauri::command]
pub fn installed_app(id: String) -> Result<Option<Installed>, String> {
    Ok(jay_i::installed(&product(&id)?.name)?.map(|i| Installed { version: i.version, location: i.location }))
}

#[tauri::command]
pub fn open_app(id: String) -> Result<(), String> {
    let product = product(&id)?;
    let app = jay_i::installed(&product.name)?.ok_or_else(|| format!("{} isn't installed", product.name))?;
    Command::new(Path::new(&app.location).join(&product.exe))
        .current_dir(&app.location)
        .spawn()
        .map(drop)
        .map_err(|e| e.to_string())
}

/// The latest release as the page needs it.
#[derive(Serialize)]
pub struct Latest {
    version: String,
    /// Rust would accept this release's installer (so the page may offer Install).
    installer: bool,
}

fn latest_of(repo: &str, release: &jay_i::Release) -> Latest {
    Latest {
        version: release.tag_name.trim_start_matches(['v', 'V']).to_owned(),
        installer: jay_i::pick_installer(repo, release).is_ok(),
    }
}

/// The latest GitHub release of the product, or None when it has none yet.
#[tauri::command]
pub async fn latest_release(id: String) -> Result<Option<Latest>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let product = product(&id)?;
        Ok(jay_i::latest(&product.repo, AGENT)?.map(|release| latest_of(&product.repo, &release)))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Downloads the product's latest installer (SHA-256 checked) into a new temporary folder.
fn download(product: &Product, progress: impl FnMut(u64, u64)) -> Result<PathBuf, String> {
    let release = jay_i::latest(&product.repo, AGENT)?.ok_or("no release yet")?;
    let installer = jay_i::pick_installer(&product.repo, &release)?;
    jay_i::download(&installer, AGENT, progress)
}

/// Not installed: the installer's own window. Installed (or Jay-H itself): the passive update, which
/// only shows progress; Jay-H opens itself again at the end.
fn mode_for(is_self: bool, installed: bool) -> Mode {
    if is_self || installed { Mode::Update { relaunch: is_self } } else { Mode::Interactive }
}

#[derive(Clone, Serialize)]
#[serde(tag = "stage", rename_all = "camelCase")]
pub enum Progress {
    Download { done: u64, total: u64 },
    /// The installer runs: in its own window (`update` false, the user finishes there) or passively.
    Installer { update: bool },
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
/// (0 = installed; 1 = cancelled, in the Jay-I setup and in NSIS; the setup returns 2 when it couldn't
/// run its installer).
#[tauri::command]
pub async fn install_app(app: tauri::AppHandle, id: String, on_progress: Channel<Progress>) -> Result<i32, String> {
    let busy = Busy::take()?;
    tauri::async_runtime::spawn_blocking(move || {
        let _busy = busy;
        let product = product(&id)?;
        let mut last = u64::MAX;
        let path = download(&product, |done, total| {
            // One message per percent is plenty.
            let percent = done * 100 / total.max(1);
            if percent != last {
                last = percent;
                let _ = on_progress.send(Progress::Download { done, total });
            }
        })?;
        let is_self = product.id == SELF_ID;
        let mode = mode_for(is_self, is_self || jay_i::installed(&product.name)?.is_some());
        let _ = on_progress.send(Progress::Installer { update: matches!(mode, Mode::Update { .. }) });
        // Jay-H can't wait for its own installer, which has to replace the running jay-h.exe.
        if is_self {
            // shortcut: the temp folder stays (the installer runs from it); Windows' temp cleanup takes
            // it. Delete it on the next start if it ever piles up.
            jay_i::run(&path, mode).spawn().map_err(|e| e.to_string())?;
            app.exit(0);
            return Ok(0);
        }
        let status = jay_i::run(&path, mode).status();
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

    const REPO: &str = "TyxMatty/Jay-C";
    const URL: &str = "https://github.com/TyxMatty/Jay-C/releases/download/v0.4.0/Jay-C_0.4.0_x64-setup.exe";
    const DIGEST: &str = "sha256:848005e8a2f42200b36f5553fd144a9d8aefdcbddbbf1ad49b56c65f473d63de";

    fn release(url: &str, digest: Option<&str>) -> jay_i::Release {
        jay_i::Release {
            tag_name: "v0.4.0".into(),
            html_url: "https://github.com/TyxMatty/Jay-C/releases/tag/v0.4.0".into(),
            assets: vec![jay_i::ReleaseAsset {
                name: "Jay-C_0.4.0_x64-setup.exe".into(),
                size: 2302415,
                browser_download_url: url.into(),
                digest: digest.map(Into::into),
            }],
        }
    }

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
        assert!(product(SELF_ID).is_ok_and(|p| p.name == "Jay-H" && p.exe == "jay-h.exe"));
    }

    #[test]
    fn latest_of_offers_install_only_for_a_checkable_installer() {
        let good = latest_of(REPO, &release(URL, Some(DIGEST)));
        assert_eq!((good.version.as_str(), good.installer), ("0.4.0", true));
        // No digest, another repository's address, no assets.
        assert!(!latest_of(REPO, &release(URL, None)).installer);
        assert!(!latest_of("TyxMatty/Jay-A", &release(URL, Some(DIGEST))).installer);
        assert!(!latest_of(REPO, &jay_i::Release { assets: vec![], ..release(URL, Some(DIGEST)) }).installer);
    }

    #[test]
    fn mode_depends_on_install_state() {
        let args = |is_self, installed| {
            jay_i::run(Path::new("x.exe"), mode_for(is_self, installed)).get_args().map(|a| a.to_string_lossy().into_owned()).collect::<Vec<_>>()
        };
        assert!(args(false, false).is_empty());
        assert_eq!(args(false, true), ["/P", "/UPDATE"]);
        assert_eq!(args(true, true), ["/P", "/UPDATE", "/R"]);
        assert_eq!(args(true, false), ["/P", "/UPDATE", "/R"]);
    }

    /// The real thing, without running it: `cargo test -- --ignored` (downloads Jay-C's installer).
    #[test]
    #[ignore]
    fn downloads_and_checks_jay_c() {
        let mut calls = 0;
        let path = download(&product("jay-c").unwrap(), |_, _| calls += 1).unwrap();
        let size = fs::metadata(&path).unwrap().len();
        fs::remove_dir_all(path.parent().unwrap()).unwrap();
        assert!(size > 1_000_000 && calls > 0, "{size} bytes, {calls} progress calls");
    }
}
