# Google Photos Metadata Merger — Project Plan

## Overview

Electron + React + Tailwind CSS desktop app that recursively scans Google Takeout folders, matches media files to their `.supplemental-metadata.json` sidecars, and writes EXIF/XMP metadata back into photos and videos.

Make sure that you are following the best practices, if needed, use context7 or websearch.

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  Electron Main Process           │
│  ┌────────────┐ ┌────────────┐ ┌──────────────┐ │
│  │ File System │ │  Metadata  │ │   EXIF/XMP   │ │
│  │  Scanner    │ │   Parser   │ │   Writer     │ │
│  └────────────┘ └────────────┘ └──────────────┘ │
│         ↕ IPC (contextBridge)                    │
│  ┌─────────────────────────────────────────────┐ │
│  │         Renderer (React + Tailwind)         │ │
│  │  Folder Picker → Preview → Merge → Report  │ │
│  └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer        | Technology                                                        |
| ------------ | ----------------------------------------------------------------- |
| Framework    | Electron (latest)                                                 |
| Bundler      | Vite + electron-vite or electron-forge + Vite                     |
| Frontend     | React 18+ with TypeScript                                         |
| Styling      | Tailwind CSS 3+                                                   |
| EXIF Writing | `exiftool` (via `exiftool-vendored`) — gold standard for metadata |
| File Ops     | Node.js `fs/promises` + `path`                                    |
| State        | Zustand or React Context                                          |
| Testing      | Vitest + Playwright (E2E)                                         |

---

## JSON Sidecar Format (Reference)

Pattern: `<filename>.supplemental-metadata.json`

Key fields to extract and write:

| JSON Field          | Target Metadata Tag     | Notes                             |
| ------------------- | ----------------------- | --------------------------------- |
| `title`             | `XMP:Title`             | Original filename                 |
| `description`       | `EXIF:ImageDescription` | User caption                      |
| `photoTakenTime`    | `EXIF:DateTimeOriginal` | Unix timestamp → EXIF date format |
| `creationTime`      | `EXIF:CreateDate`       | Fallback if photoTakenTime absent |
| `geoData.latitude`  | `EXIF:GPSLatitude`      | Skip if 0.0                       |
| `geoData.longitude` | `EXIF:GPSLongitude`     | Skip if 0.0                       |
| `geoData.altitude`  | `EXIF:GPSAltitude`      | Skip if 0.0                       |
| `geoDataExif`       | Same GPS tags           | Prefer over `geoData` if differs  |
| `people[].name`     | `XMP:PersonInImage`     | Face tag names                    |

---

## Feature Breakdown

### Phase 1 — Core Engine (Main Process)

#### 1.1 Recursive File Scanner

- Accept root folder path via Electron `dialog.showOpenDialog`
- Recursively walk all subdirectories using `fs/promises.readdir({ recursive: true })` or manual recursion
- Build file index: Map of `filePath → { mediaFile, jsonFile, matched: boolean }`
- Matching logic:
  ```
  For each file:
    if file ends with ".supplemental-metadata.json":
      extract base name (strip ".supplemental-metadata.json")
      look for media file with that base name in same directory
      mark as matched pair
  ```
- Handle edge cases:
  - Duplicate filenames across folders
  - JSON exists but media missing (orphaned metadata)
  - Media exists but no JSON (no metadata to merge)
  - Files with special characters, spaces, unicode names

#### 1.2 JSON Metadata Parser

- Read each matched `.supplemental-metadata.json`
- Validate required fields exist
- Convert timestamps: Unix epoch → `YYYY:MM:DD HH:MM:SS` (EXIF format)
- Convert GPS coordinates → EXIF GPS format (degrees + ref N/S/E/W)
- Skip zero-value GPS (lat=0, lon=0 means "not set")
- Return structured `MetadataPayload` object

#### 1.3 EXIF/XMP Writer

- Use `exiftool-vendored` (bundles ExifTool binary cross-platform)
- Write metadata fields to media file
- Supported formats: JPEG, PNG, HEIC, TIFF, MOV, MP4, AVI
- Options:
  - **Overwrite original** (modify in-place, keep backup)
  - **Copy to output folder** (non-destructive, write to copy)
- Preserve existing metadata — only write fields from JSON
- Handle write failures gracefully (permissions, locked files, unsupported formats)

#### 1.4 IPC Bridge

- Expose via `contextBridge.exposeInMainWorld`:
  ```typescript
  interface ElectronAPI {
    selectFolder(): Promise<string | null>
    scanFolder(path: string): Promise<ScanResult>
    previewFile(filePath: string): Promise<FilePreview>
    mergeMetadata(pairs: MatchedPair[], options: MergeOptions): void
    onMergeProgress(callback: (progress: ProgressEvent) => void): void
    cancelMerge(): void
  }
  ```

---

### Phase 2 — User Interface (Renderer)

#### 2.1 App Flow (4 Steps)

```
[Select Folder] → [Scan & Preview] → [Configure & Merge] → [Results Report]
```

#### Step 1: Folder Selection

- Large drop zone / folder picker button
- Show selected path
- "Scan" button triggers recursive scan
- Loading spinner with file count during scan

#### Step 2: Scan Results & Preview

- Summary stats card:
  - Total files found
  - Matched pairs count
  - Orphaned JSONs (no media)
  - Unmatched media (no JSON)
- Scrollable table/list of matched pairs:
  - Thumbnail (for images)
  - Filename
  - Date from JSON
  - GPS present (yes/no icon)
  - People tags
  - Status badge (ready / warning / error)
- Filter/search bar
- Select all / deselect individual files
- Expandable row → full JSON preview + current EXIF comparison

#### Step 3: Merge Configuration

- Output mode toggle:
  - ☐ Modify originals (keep `.bak` backup)
  - ☐ Copy to output folder (choose destination)
- Field toggles — choose which metadata to write:
  - ☐ Date/Time
  - ☐ GPS Location
  - ☐ Description
  - ☐ People Tags
  - ☐ Title
- "Start Merge" button
- Progress bar with:
  - Current file name
  - X of Y completed
  - Estimated time remaining
  - Cancel button

#### Step 4: Results Report

- Summary: succeeded / failed / skipped counts
- Error log (expandable) with file paths + error messages
- "Open Output Folder" button
- "Export Report" (save log as CSV/JSON)
- "Start Over" button

---

### Phase 3 — Polish & Edge Cases

#### 3.1 Error Handling

- Graceful handling for:
  - Permission denied on files
  - Corrupt JSON files (malformed syntax)
  - Unsupported media formats
  - Disk space checks before copy mode
  - ExifTool write failures
- Per-file error capture — never abort entire batch

#### 3.2 Performance

- Stream file scanning (don't load all into memory)
- Process merges in batches (e.g., 5 concurrent ExifTool writes)
- Use Web Workers or separate Node thread for heavy scanning
- Virtualized list rendering for large file sets (react-window)

#### 3.3 Cross-Platform

- ExifTool binary bundled for macOS, Windows, Linux via `exiftool-vendored`
- Path handling via `path.join` / `path.sep` (no hardcoded slashes)
- Native file dialogs per OS
- Code signing + auto-update (electron-updater) for distribution

---

## Data Types (TypeScript)

```typescript
interface MatchedPair {
  id: string
  mediaPath: string
  jsonPath: string
  relativePath: string // relative to scan root
  metadata: ParsedMetadata
  status: 'ready' | 'warning' | 'error'
  error?: string
}

interface ParsedMetadata {
  title: string
  description: string
  photoTakenTime: Date | null
  creationTime: Date | null
  geoData: GeoData | null // null if all zeros
  geoDataExif: GeoData | null
  people: string[]
}

interface GeoData {
  latitude: number
  longitude: number
  altitude: number
}

interface MergeOptions {
  mode: 'overwrite' | 'copy'
  outputPath?: string // required if mode='copy'
  fields: {
    dateTime: boolean
    gps: boolean
    description: boolean
    people: boolean
    title: boolean
  }
}

interface ProgressEvent {
  current: number
  total: number
  currentFile: string
  status: 'processing' | 'done' | 'cancelled' | 'error'
}

interface ScanResult {
  matched: MatchedPair[]
  orphanedJsons: string[]
  unmatchedMedia: string[]
  totalFilesScanned: number
}
```

---

## Folder Structure

```
google-photos-merger/
├── electron/
│   ├── main.ts                 # Electron main process entry
│   ├── preload.ts              # contextBridge IPC exposure
│   ├── services/
│   │   ├── scanner.ts          # Recursive file scanner
│   │   ├── matcher.ts          # JSON ↔ media file matching
│   │   ├── parser.ts           # JSON metadata parser + converter
│   │   └── writer.ts           # ExifTool metadata writer
│   └── ipc/
│       └── handlers.ts         # IPC handler registration
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── index.css               # Tailwind directives
│   ├── components/
│   │   ├── FolderPicker.tsx
│   │   ├── ScanResults.tsx
│   │   ├── FileTable.tsx
│   │   ├── FileRow.tsx
│   │   ├── MetadataPreview.tsx
│   │   ├── MergeConfig.tsx
│   │   ├── ProgressBar.tsx
│   │   └── ResultsReport.tsx
│   ├── hooks/
│   │   ├── useScan.ts
│   │   ├── useMerge.ts
│   │   └── useProgress.ts
│   ├── store/
│   │   └── appStore.ts         # Zustand store
│   └── types/
│       └── index.ts            # Shared TypeScript types
├── package.json
├── electron-builder.yml        # Build/packaging config
├── tailwind.config.js
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

## Implementation Order

| Order | Task                                        | Est. Effort    |
| ----- | ------------------------------------------- | -------------- |
| 1     | Scaffold Electron + Vite + React + Tailwind | 2-3 hrs        |
| 2     | Recursive scanner + matcher                 | 3-4 hrs        |
| 3     | JSON parser + timestamp/GPS converter       | 2-3 hrs        |
| 4     | ExifTool writer integration                 | 3-4 hrs        |
| 5     | IPC bridge (preload + handlers)             | 2 hrs          |
| 6     | Folder picker UI                            | 1-2 hrs        |
| 7     | Scan results + file table                   | 3-4 hrs        |
| 8     | Merge config + progress UI                  | 2-3 hrs        |
| 9     | Results report                              | 1-2 hrs        |
| 10    | Error handling + edge cases                 | 3-4 hrs        |
| 11    | Performance (batching, virtualization)      | 2-3 hrs        |
| 12    | Cross-platform testing + packaging          | 3-4 hrs        |
|       | **Total estimate**                          | **~30-40 hrs** |

---

## Key Decisions to Make

1. **ExifTool vs native libraries** — `exiftool-vendored` recommended (handles all formats, cross-platform, battle-tested). Alternative: `sharp` for images only (no video support).

2. **Destructive vs non-destructive default** — Recommend defaulting to "copy to output folder" mode. Safer for users' precious photos.

3. **Backup strategy** — If overwrite mode selected, ExifTool creates `_original` backup files. Give user option to delete backups after verification.

4. **Duplicate filename resolution** — When copying to output folder, preserve folder structure or flatten with conflict resolution (append counter).

5. **Video metadata** — MOV/MP4 use different metadata containers (QuickTime vs MP4). ExifTool handles both, but test thoroughly.
