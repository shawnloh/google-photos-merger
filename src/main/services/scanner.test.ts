import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { promises as fs } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { scanFolder } from './scanner'

async function mkdirp(p: string): Promise<void> {
  await fs.mkdir(p, { recursive: true })
}

async function writeFile(p: string, content: string): Promise<void> {
  await mkdirp(join(p, '..').replace(/[^/]+$/, ''))
  await fs.writeFile(p, content)
}

const VALID_JSON = JSON.stringify({
  title: 'Test Photo',
  description: '',
  photoTakenTime: { timestamp: '1609459200' },
  creationTime: { timestamp: '1609459200' },
  geoData: { latitude: 0, longitude: 0, altitude: 0 },
  people: []
})

describe('scanFolder — cross-chunk matching', () => {
  let root: string

  beforeAll(async () => {
    root = join(tmpdir(), `scan-test-${randomUUID()}`)
    // Takeout 1: has the photo
    await mkdirp(join(root, 'Takeout 1', 'Google Photos', '2023'))
    await fs.writeFile(join(root, 'Takeout 1', 'Google Photos', '2023', 'photo.jpg'), 'JPEG')
    // Takeout 2: has the sidecar for that photo
    await mkdirp(join(root, 'Takeout 2', 'Google Photos', '2023'))
    await fs.writeFile(
      join(root, 'Takeout 2', 'Google Photos', '2023', 'photo.jpg.supplemental-metadata.json'),
      VALID_JSON
    )
  })

  afterAll(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  it('auto-matches a sidecar to a media file in a different chunk folder', async () => {
    const result = await scanFolder(root)
    expect(result.matched).toHaveLength(1)
    expect(result.matched[0].matchType).toBe('cross-chunk')
    expect(result.orphanedJsons).toHaveLength(0)
  })

  it('marks same-directory matches as same-dir', async () => {
    const root2 = join(tmpdir(), `scan-test-samedir-${randomUUID()}`)
    await mkdirp(join(root2, 'Takeout 1', 'Google Photos'))
    await fs.writeFile(join(root2, 'Takeout 1', 'Google Photos', 'img.jpg'), 'JPEG')
    await fs.writeFile(
      join(root2, 'Takeout 1', 'Google Photos', 'img.jpg.supplemental-metadata.json'),
      VALID_JSON
    )
    const result = await scanFolder(root2)
    expect(result.matched[0].matchType).toBe('same-dir')
    await fs.rm(root2, { recursive: true, force: true })
  })

  it('matches a media file whose sidecar has a truncated suffix (.supplemental-metadat.json)', async () => {
    const rootT = join(tmpdir(), `scan-test-truncated-${randomUUID()}`)
    await mkdirp(join(rootT, 'Takeout 1', 'Google Photos'))
    // Media file with a long name that causes Google Takeout to truncate the sidecar suffix
    await fs.writeFile(
      join(rootT, 'Takeout 1', 'Google Photos', '2013-02-02 22.42.04-1.jpg'),
      'JPEG'
    )
    // Sidecar with truncated suffix: ".supplemental-metadat.json" instead of ".supplemental-metadata.json"
    await fs.writeFile(
      join(
        rootT,
        'Takeout 1',
        'Google Photos',
        '2013-02-02 22.42.04-1.jpg.supplemental-metadat.json'
      ),
      VALID_JSON
    )
    const result = await scanFolder(rootT)
    expect(result.matched).toHaveLength(1)
    expect(result.matched[0].matchType).toBe('same-dir')
    expect(result.orphanedJsons).toHaveLength(0)
    await fs.rm(rootT, { recursive: true, force: true })
  })

  it('leaves truly orphaned JSONs (no media anywhere) in orphanedJsons', async () => {
    const root3 = join(tmpdir(), `scan-test-orphan-${randomUUID()}`)
    await mkdirp(join(root3, 'Takeout 1'))
    await fs.writeFile(
      join(root3, 'Takeout 1', 'ghost.jpg.supplemental-metadata.json'),
      VALID_JSON
    )
    const result = await scanFolder(root3)
    expect(result.matched).toHaveLength(0)
    expect(result.orphanedJsons).toHaveLength(1)
    await fs.rm(root3, { recursive: true, force: true })
  })

  it('picks the candidate sharing most path segments when multiple chunks have the same filename', async () => {
    const root4 = join(tmpdir(), `scan-test-multi-${randomUUID()}`)
    // JSON is in Takeout 3 / Google Photos / 2023
    await mkdirp(join(root4, 'Takeout 3', 'Google Photos', '2023'))
    await fs.writeFile(
      join(root4, 'Takeout 3', 'Google Photos', '2023', 'dup.jpg.supplemental-metadata.json'),
      VALID_JSON
    )
    // Closer match: same album path
    await mkdirp(join(root4, 'Takeout 1', 'Google Photos', '2023'))
    await fs.writeFile(join(root4, 'Takeout 1', 'Google Photos', '2023', 'dup.jpg'), 'JPEG-A')
    // Further match: different album
    await mkdirp(join(root4, 'Takeout 2', 'Google Photos', 'Vacation'))
    await fs.writeFile(join(root4, 'Takeout 2', 'Google Photos', 'Vacation', 'dup.jpg'), 'JPEG-B')
    const result = await scanFolder(root4)
    expect(result.matched).toHaveLength(1)
    expect(result.matched[0].mediaPath).toContain('Takeout 1')
    await fs.rm(root4, { recursive: true, force: true })
  })
})

// Helper used only in tests — writes a buffer to a temp file
async function writeBinaryFile(p: string, bytes: Buffer): Promise<void> {
  await mkdirp(join(p, '..').replace(/[^/]+$/, ''))
  await fs.writeFile(p, bytes)
}

// JPEG magic bytes
const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01])

describe('scanFolder — extension mismatch detection', () => {
  it('sets status=warning and warning message when a .PNG file contains JPEG data', async () => {
    const root = join(tmpdir(), `scan-test-mismatch-${randomUUID()}`)
    await mkdirp(join(root, 'Photos'))
    // Write a file named .PNG but with JPEG magic bytes
    await writeBinaryFile(join(root, 'Photos', 'IMG_1707_Original.PNG'), JPEG_HEADER)
    await fs.writeFile(
      join(root, 'Photos', 'IMG_1707_Original.PNG.supplemental-metadata.json'),
      VALID_JSON
    )
    const result = await scanFolder(root)
    expect(result.matched).toHaveLength(1)
    const pair = result.matched[0]
    expect(pair.status).toBe('warning')
    expect(pair.warning).toMatch(/extension mismatch/i)
    expect(pair.warning).toMatch(/jpeg/i)
    expect(pair.warning).toMatch(/\.png/i)
    await fs.rm(root, { recursive: true, force: true })
  })

  it('does NOT set warning when extension matches content (real JPEG as .jpg)', async () => {
    const root = join(tmpdir(), `scan-test-nomismatch-${randomUUID()}`)
    await mkdirp(join(root, 'Photos'))
    await writeBinaryFile(join(root, 'Photos', 'photo.jpg'), JPEG_HEADER)
    await fs.writeFile(
      join(root, 'Photos', 'photo.jpg.supplemental-metadata.json'),
      VALID_JSON
    )
    const result = await scanFolder(root)
    expect(result.matched).toHaveLength(1)
    const pair = result.matched[0]
    expect(pair.status).toBe('ready')
    expect(pair.warning).toBeUndefined()
    await fs.rm(root, { recursive: true, force: true })
  })
})
