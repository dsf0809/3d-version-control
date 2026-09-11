// A minimal OPC ZIP writer: stored entries, UTF-8 names, CRC32 and central directory.
// No Node APIs, so exports work in Cloudflare Workers too.
function zip(files: Record<string, string>): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder(),
    parts: Uint8Array[] = [],
    central: Uint8Array[] = [];
  let offset = 0;
  for (const [path, text] of Object.entries(files)) {
    const name = encoder.encode(path),
      data = encoder.encode(text);
    let crc = 0xffffffff;
    for (const byte of data) {
      crc ^= byte;
      for (let i = 0; i < 8; i++)
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const local = new Uint8Array(30 + name.length),
      lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x800, true);
    lv.setUint16(12, 33, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    const entry = new Uint8Array(46 + name.length),
      cv = new DataView(entry.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x800, true);
    cv.setUint16(14, 33, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    entry.set(name, 46);
    parts.push(local, data);
    central.push(entry);
    offset += local.length + data.length;
  }
  const directorySize = central.reduce((n, p) => n + p.length, 0),
    end = new Uint8Array(22),
    ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, central.length, true);
  ev.setUint16(10, central.length, true);
  ev.setUint32(12, directorySize, true);
  ev.setUint32(16, offset, true);
  const output = new Uint8Array(offset + directorySize + 22);
  let cursor = 0;
  for (const part of [...parts, ...central, end]) {
    output.set(part, cursor);
    cursor += part.length;
  }
  return output;
}
const escape = (s: string) =>
  s
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(
      /[&<>"']/g,
      (c) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&apos;',
        })[c]!,
    );
export function threeMF(
  positions: Float32Array,
  name: string,
): Uint8Array<ArrayBuffer> {
  if (!positions.length || positions.length % 9 || positions.length > 9000000)
    throw new Error('Invalid or oversized triangle mesh.');
  const vertices: string[] = [],
    triangles: string[] = [],
    ids = new Map<string, number>();
  for (let i = 0; i < positions.length; i += 9) {
    const indices: number[] = [];
    for (let j = 0; j < 9; j += 3) {
      const xyz = [
        positions[i + j],
        positions[i + j + 1],
        positions[i + j + 2],
      ];
      if (xyz.some((n) => !Number.isFinite(n)))
        throw new Error('Non-finite mesh coordinate.');
      const key = xyz.join(',');
      let index = ids.get(key);
      if (index === undefined) {
        index = vertices.length;
        ids.set(key, index);
        vertices.push(`<vertex x="${xyz[0]}" y="${xyz[1]}" z="${xyz[2]}"/>`);
      }
      indices.push(index);
    }
    if (new Set(indices).size !== 3) throw new Error('Degenerate triangle.');
    triangles.push(
      `<triangle v1="${indices[0]}" v2="${indices[1]}" v3="${indices[2]}"/>`,
    );
  }
  return zip({
    '[Content_Types].xml':
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>',
    '_rels/.rels':
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>',
    '3D/3dmodel.model': `<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><metadata name="Title">${escape(name)}</metadata><resources><basematerials id="1"><base name="Form blue" displaycolor="#778EE0FF"/></basematerials><object id="2" type="model" name="${escape(name)}" pid="1" pindex="0"><mesh><vertices>${vertices.join('')}</vertices><triangles>${triangles.join('')}</triangles></mesh></object></resources><build><item objectid="2"/></build></model>`,
  });
}
