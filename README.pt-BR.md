# Jay-H

[English](README.md) · **Português**

O hub da linha Jay: todos os apps Jay ([Jay-C](https://github.com/TyxMatty/Jay-C), [Jay-A](https://github.com/TyxMatty/Jay-A)) num lugar só, para instalar, atualizar e abrir. Windows primeiro.

Plano e etapas: [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md). Por enquanto o app tem a janela (nos estilos Calmo, Neon e Suave do Jay-C) e um card por produto com a versão instalada, a mais nova no GitHub e os botões para instalar, atualizar e abrir.

## Rodando

Node 22+ e Rust com MSVC (ver `docs/CONTINUAR.md` do Jay-C).

```bash
npm install
npm run dev
```

`npm run dev` abre a janela do Jay-H (Tauri) com recarga automática. Para abrir só a interface no navegador, sem Tauri: `npm run web` (porta 5176).

Para o build do Rust ficar fora do OneDrive, crie um `.cargo/config.toml` (fora do git):

```toml
[build]
target-dir = "C:/Users/<você>/.cargo-target/jay-h"
```

## Testes

```bash
npm test
cd frontend/src-tauri && cargo test               # com -- --ignored, baixa o instalador real do Jay-C (sem rodar)
```

Para testar o app de verdade (com os comandos do Rust): abra-o com `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9225` e rode `node scripts/cdp-eval.mjs <arquivo.js>`, que executa o arquivo dentro da página dele.

## Licença

MIT.
