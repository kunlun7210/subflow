const IPV4_RECORD_SIZE = 10;
const IPV6_RECORD_SIZE = 34;

function ipv4Bytes(value: string): Uint8Array | null {
  const parts = value.split("."); if (parts.length !== 4) return null;
  const numbers = parts.map(Number);
  return numbers.some(part => !Number.isInteger(part) || part < 0 || part > 255) ? null : Uint8Array.from(numbers);
}

function ipv6Bytes(value: string): Uint8Array | null {
  let clean = value.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0]; if (!clean.includes(":")) return null;
  if (clean.includes(".")) {
    const lastColon = clean.lastIndexOf(":"); const ipv4 = ipv4Bytes(clean.slice(lastColon + 1)); if (!ipv4) return null;
    clean = `${clean.slice(0, lastColon)}:${((ipv4[0] << 8) | ipv4[1]).toString(16)}:${((ipv4[2] << 8) | ipv4[3]).toString(16)}`;
  }
  const halves = clean.split("::"); if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : []; const right = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;
  const groups = [...left, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...right];
  if (groups.length !== 8 || groups.some(group => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  return Uint8Array.from(groups.flatMap(group => { const number = Number.parseInt(group, 16); return [number >> 8, number & 0xff]; }));
}

function compare(left: Uint8Array, data: Uint8Array, offset: number): number {
  for (let index = 0; index < left.length; index += 1) { if (left[index] < data[offset + index]) return -1; if (left[index] > data[offset + index]) return 1; }
  return 0;
}

function code(data: Uint8Array, offset: number): string | null {
  const left = data[offset]; const right = data[offset + 1];
  return left >= 65 && left <= 90 && right >= 65 && right <= 90 ? String.fromCharCode(left, right) : null;
}

export class IPCountryDatabase {
  constructor(private readonly ipv4: Uint8Array, private readonly ipv6: Uint8Array) {}
  static isIPAddress(value: string): boolean { return Boolean(ipv4Bytes(value) || ipv6Bytes(value)); }
  countryCode(value: string): string | null {
    const v4 = ipv4Bytes(value);
    if (v4) {
      const address = ((v4[0] * 0x1000000) + (v4[1] << 16) + (v4[2] << 8) + v4[3]) >>> 0;
      const view = new DataView(this.ipv4.buffer, this.ipv4.byteOffset, this.ipv4.byteLength);
      let low = 0; let high = this.ipv4.length / IPV4_RECORD_SIZE - 1;
      while (low <= high) {
        const record = low + Math.floor((high - low) / 2); const offset = record * IPV4_RECORD_SIZE;
        const start = view.getUint32(offset, false); const end = view.getUint32(offset + 4, false);
        if (address < start) high = record - 1; else if (address > end) low = record + 1; else return code(this.ipv4, offset + 8);
      }
      return null;
    }
    const v6 = ipv6Bytes(value); if (!v6) return null;
    let low = 0; let high = this.ipv6.length / IPV6_RECORD_SIZE - 1;
    while (low <= high) {
      const record = low + Math.floor((high - low) / 2); const offset = record * IPV6_RECORD_SIZE;
      if (compare(v6, this.ipv6, offset) < 0) high = record - 1; else if (compare(v6, this.ipv6, offset + 16) > 0) low = record + 1; else return code(this.ipv6, offset + 32);
    }
    return null;
  }
}

let databasePromise: Promise<IPCountryDatabase> | null = null;
export function loadIPCountryDatabase(fetcher: typeof fetch = fetch): Promise<IPCountryDatabase> {
  if (databasePromise) return databasePromise;
  const base = typeof document === "undefined" ? "http://localhost/" : document.baseURI;
  databasePromise = Promise.all([
    fetcher(new URL("./ip-country/IPCountryIPv4.bin", base)).then(response => { if (!response.ok) throw new Error(`IPv4 country database HTTP ${response.status}`); return response.arrayBuffer(); }),
    fetcher(new URL("./ip-country/IPCountryIPv6.bin", base)).then(response => { if (!response.ok) throw new Error(`IPv6 country database HTTP ${response.status}`); return response.arrayBuffer(); }),
  ]).then(([ipv4, ipv6]) => new IPCountryDatabase(new Uint8Array(ipv4), new Uint8Array(ipv6)));
  return databasePromise;
}
