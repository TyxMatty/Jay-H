# Jay-H

**English** · [Português](README.pt-BR.md)

The hub of the Jay line: every Jay app ([Jay-C](https://github.com/TyxMatty/JayC), [Jay-A](https://github.com/TyxMatty/Jay-A)) in one place, to install, update and open them. Windows first.

Plan and stages: [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) (in Portuguese). For now the app has its window (in Jay-C's Calm, Neon and Soft styles) and a card per product with a link to its repository. Versions, install and update come next.

## Running

Node 22+ and Rust with MSVC (see Jay-C's `docs/CONTINUAR.en.md`).

```bash
npm install
npm run dev
```

`npm run dev` opens the Jay-H window (Tauri) with live reload. To open just the interface in a browser, without Tauri: `npm run web` (port 5176).

To keep the Rust build out of OneDrive, create a `.cargo/config.toml` (not tracked by git):

```toml
[build]
target-dir = "C:/Users/<you>/.cargo-target/jay-h"
```

## Tests

```bash
npm test
```

## License

MIT.
