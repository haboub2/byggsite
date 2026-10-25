/**
 * A minimal zip writer for the documentation export (PDF plus original
 * photos). Entries are stored, not deflated: the photos are JPEGs and the
 * PDF is already compressed, so deflate would cost time and save nothing.
 * Names are UTF-8 (flag bit 11), so "Tätskikt" stays "Tätskikt" in the
 * Windows, macOS and Linux unzippers. No zip64: an export stays far below
 * 4 GB and 65 535 files, and createZip refuses anything larger.
 */

export type ZipEntry = { name: string; data: Uint8Array; date?: Date };

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** MS-DOS time and date, local time as zip tools expect; 1980 is the floor. */
function dosDateTime(d: Date): { time: number; date: number } {
  const year = Math.max(1980, d.getFullYear());
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

const LIMIT = 0xffffffff;

export function createZip(entries: ZipEntry[]): Buffer {
  if (entries.length > 0xffff) throw new Error("För många filer för en zip.");
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  const seen = new Set<string>();
  for (const entry of entries) {
    const name = entry.name.replace(/\\/g, "/").replace(/^\/+/, "");
    if (!name || seen.has(name)) throw new Error(`Filnamnet finns redan i zip-filen: ${name}`);
    seen.add(name);
    const nameBytes = Buffer.from(name, "utf8");
    const data = entry.data;
    const crc = crc32(data);
    const { time, date } = dosDateTime(entry.date ?? new Date());

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // made by
    central.writeUInt16LE(20, 6); // needed
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    // extra, comment, disk, internal attrs: 0
    central.writeUInt32LE(0, 38); // external attrs
    central.writeUInt32LE(offset, 42);

    locals.push(local, nameBytes, Buffer.from(data.buffer, data.byteOffset, data.byteLength));
    centrals.push(central, nameBytes);
    offset += 30 + nameBytes.length + data.length;
    if (offset > LIMIT) throw new Error("Zip-filen blir för stor.");
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

/** The inverse of dosDateTime (local time, two-second resolution). */
function fromDosDateTime(time: number, date: number): Date {
  return new Date(1980 + (date >> 9), ((date >> 5) & 0x0f) - 1, date & 0x1f, time >> 11, (time >> 5) & 0x3f, (time & 0x1f) * 2);
}

/**
 * Read a zip written by createZip back (stored entries only): for the tests,
 * and for the background PDF archive, which renders its invoices into part
 * zips and joins them into one at the end (lib/core/export/job-store.ts).
 */
export function readStoredZip(zip: Buffer): { name: string; data: Buffer; date: Date; crcOk: boolean }[] {
  const endAt = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (endAt < 0) throw new Error("Ingen zip.");
  const count = zip.readUInt16LE(endAt + 10);
  let at = zip.readUInt32LE(endAt + 16);
  const out: { name: string; data: Buffer; date: Date; crcOk: boolean }[] = [];
  for (let i = 0; i < count; i++) {
    if (zip.readUInt32LE(at) !== 0x02014b50) throw new Error("Trasig central katalog.");
    if (zip.readUInt16LE(at + 10) !== 0) throw new Error("Bara okomprimerade zip-filer kan läsas.");
    const date = fromDosDateTime(zip.readUInt16LE(at + 12), zip.readUInt16LE(at + 14));
    const crc = zip.readUInt32LE(at + 16);
    const size = zip.readUInt32LE(at + 20);
    const nameLen = zip.readUInt16LE(at + 28);
    const extraLen = zip.readUInt16LE(at + 30);
    const commentLen = zip.readUInt16LE(at + 32);
    const localAt = zip.readUInt32LE(at + 42);
    const name = zip.subarray(at + 46, at + 46 + nameLen).toString("utf8");
    const localNameLen = zip.readUInt16LE(localAt + 26);
    const localExtraLen = zip.readUInt16LE(localAt + 28);
    const start = localAt + 30 + localNameLen + localExtraLen;
    const data = zip.subarray(start, start + size);
    out.push({ name, data, date, crcOk: crc32(data) === crc });
    at += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}
