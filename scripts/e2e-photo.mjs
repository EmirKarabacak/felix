// A small picture for the end-to-end tests to "take" when Felix opens the
// camera (Update 2: finishing a step needs a photo). Written once, as a real
// PNG, so the browser can read and shrink it like a phone photo.
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { crc32, deflateSync } from 'node:zlib'

export function photoFile(name = 'felix-test-photo.png') {
  const width = 640
  const height = 480
  const rows = []
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3)
    for (let x = 0; x < width; x++) {
      // A blue-grey gradient with an orange square: something to see in a screenshot.
      const square = x > 220 && x < 420 && y > 140 && y < 340
      row[1 + x * 3] = square ? 240 : 40 + (x * 120) / width
      row[2 + x * 3] = square ? 140 : 70 + (y * 100) / height
      row[3 + x * 3] = square ? 30 : 120
    }
    rows.push(row)
  }
  const chunk = (type, data) => {
    const out = Buffer.alloc(12 + data.length)
    out.writeUInt32BE(data.length, 0)
    out.write(type, 4, 'ascii')
    data.copy(out, 8)
    out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length)
    return out
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // bit depth
  header[9] = 2 // RGB
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ])
  const path = join(tmpdir(), name)
  writeFileSync(path, png)
  return path
}
