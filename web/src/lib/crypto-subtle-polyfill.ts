/* crypto.subtle.digest polyfill for insecure contexts.
   Browsers gate window.crypto.subtle behind secure contexts (HTTPS or localhost).
   Artimis is served over plain HTTP on the tailnet (http://100.95.117.9:7002),
   so crypto.subtle is undefined and Sandpack's bundler client crashes on
   crypto.subtle.digest before the preview iframe ever loads.
   This installs a pure-JS SHA-256 digest so the Sandpack client can boot.
   Only active when the native implementation is missing. */

const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]

export function sha256Bytes(data: Uint8Array): Uint8Array {
  const bitLen = data.length * 8
  const paddedLen = (((data.length + 8) >> 6) + 1) << 6
  const msg = new Uint8Array(paddedLen)
  msg.set(data)
  msg[data.length] = 0x80
  const dv = new DataView(msg.buffer)
  dv.setUint32(paddedLen - 4, bitLen >>> 0)
  dv.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000))

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19

  const w = new Uint32Array(64)
  for (let block = 0; block < paddedLen; block += 64) {
    for (let t = 0; t < 16; t++) w[t] = dv.getUint32(block + t * 4)
    for (let t = 16; t < 64; t++) {
      const x = w[t - 15], y = w[t - 2]
      const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3)
      const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10)
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7
    for (let t = 0; t < 64; t++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))
      const ch = (e & f) ^ (~e & g)
      const t1 = (h + S1 + ch + K[t] + w[t]) | 0
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const t2 = (S0 + maj) | 0
      h = g; g = f; f = e; e = (d + t1) | 0
      d = c; c = b; b = a; a = (t1 + t2) | 0
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0
  }

  const out = new Uint8Array(32)
  const odv = new DataView(out.buffer)
  const words = [h0, h1, h2, h3, h4, h5, h6, h7]
  for (let i = 0; i < 8; i++) odv.setUint32(i * 4, words[i] >>> 0)
  return out
}

export function installCryptoSubtlePolyfill(): void {
  if (typeof window === "undefined") return
  const cryptoObj = window.crypto as (Crypto & { subtle?: SubtleCrypto }) | undefined
  if (!cryptoObj || cryptoObj.subtle) return

  const subtle = {
    digest(algorithm: AlgorithmIdentifier, data: BufferSource): Promise<ArrayBuffer> {
      const name = (typeof algorithm === "string" ? algorithm : algorithm.name).toUpperCase().replace("-", "")
      const bytes = data instanceof ArrayBuffer
        ? new Uint8Array(data)
        : new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
      if (name === "SHA256") {
        return Promise.resolve(sha256Bytes(bytes).buffer as ArrayBuffer)
      }
      return Promise.reject(new Error(`crypto.subtle.digest polyfill: unsupported algorithm ${name}`))
    },
  }

  try {
    Object.defineProperty(cryptoObj, "subtle", { value: subtle, configurable: true })
  } catch {
    ;(cryptoObj as { subtle?: unknown }).subtle = subtle
  }
}

installCryptoSubtlePolyfill()
