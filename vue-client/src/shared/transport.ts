let transport: WebTransport | null = null

export async function getTransport(): Promise<WebTransport> {
  if (transport) return transport

  const transportUrl = import.meta.env.VITE_TRANSPORT_URL as string

  // self-signed dev certs need a pinned hash; prod uses a CA-trusted cert, so skip it
  let options: WebTransportOptions = {}
  if (import.meta.env.DEV) {
    const hashRes = await fetch("/certs/cert-hash.json")
    if (!hashRes.ok) throw new Error("could not fetch /certs/cert-hash.json - did server.js generate it?")
    const { hashHex } = await hashRes.json()
    options = {
      serverCertificateHashes: [
        {
          algorithm: "sha-256",
          value: hexToU8(hashHex),
        },
      ],
    }
  }

  transport = new WebTransport(transportUrl, options)

  await transport.ready
  return transport
}

function hexToU8(hex: string): Uint8Array<ArrayBuffer> {
  const clean = hex.replace(/\s|:/g, "")
  const arr = new Uint8Array(new ArrayBuffer(clean.length / 2))
  for (let i = 0; i < clean.length; i += 2) {
    arr[i / 2] = parseInt(clean.substr(i, 2), 16)
  }
  return arr
}
