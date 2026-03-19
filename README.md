<div align="center">

<img width="full" alt="Multiplexer" src="docs/hero.png" />

### Multiplexer

Open-source macOS desktop app for [Boltz-2](https://boltz.bio) structure and affinity predictions.
Paste SMILES, import a CSV, and get predicted 3D structures back – all on your desktop.

<br />

[**Download for macOS**](https://github.com/ashxudev/multiplexer/releases/latest/download/Multiplexer-arm64.dmg)

<br />

</div>

## What it does

Multiplexer makes it easy to run Boltz-2 predictions while working with local files. Paste a target sequence, drop in a list of compounds, and review predicted structures and binding metrics in a single interface. It connects to the [Boltz Lab](https://lab.boltz.bio) cloud API, which has a generous free tier - you just need to sign up for an API key.

All data stays on your machine. Multiplexer stores everything locally and only sends sequences and SMILES to the Boltz Lab API for prediction.

## Getting started

1. **Install** - Open the `.dmg` and drag Multiplexer to Applications.
2. **API key** - Go to [lab.boltz.bio](https://lab.boltz.bio), create a free account, and generate an API key. Paste it into Settings inside the app.
3. **New campaign** - Click "New Campaign", name it, and paste your target sequence.
4. **Add compounds** - Click "New Run". Paste SMILES (one per line, or `name,SMILES`), or import a CSV file.
5. **Submit** - Hit Submit. Compounds are sent to Boltz Lab in parallel with automatic rate-limit handling and retries.
6. **Review** - Click any completed compound to see the predicted 3D structure, confidence metrics, and 2D structure.
7. **Export** - Click "Export CSV" to download all results.

## Features

**Input**
- Paste SMILES or name,SMILES pairs
- CSV/TSV import with automatic column detection
- Real-time SMILES validation via RDKit

**Screening**
- Batch concurrent submission (5 at a time)
- Automatic rate-limit handling and retries for large batches
- Configurable Boltz-2 model parameters (recycling steps, diffusion samples, step scale)
- Desktop notifications on run completion

**Review**
- Interactive 3D structure viewer (Mol\*) with confidence coloring
- Six metrics per compound: binding confidence, optimization score, structure confidence, pLDDT, ipTM, pTM
- Sortable results table
- CSV export

**App**
- Uses your own Boltz Lab API key
- All data stays on your machine
- Light and dark mode

## Tech stack

Electron, React, TypeScript, Tailwind CSS, tRPC, Mol\*, RDKit WASM, Zustand

## License

[MIT](LICENSE)
