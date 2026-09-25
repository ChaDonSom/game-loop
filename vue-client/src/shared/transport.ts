let transport: WebTransport | null = null

export async function getTransport(): Promise<WebTransport> {
  if (transport) return transport

  const transportUrl = import.meta.env.VITE_TRANSPORT_URL as string

  // self-signed dev certs need a pinned hash; prod uses a CA-trusted cert, so skip it
  let options: WebTransportOptions = {}
  if (import.meta.env.DEV && shouldPinLocalCertificate(transportUrl)) {
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

  const nextTransport = new WebTransport(transportUrl, options)
  transport = nextTransport

  try {
    await nextTransport.ready
  } catch (err) {
    if (transport === nextTransport) {
      transport = null
    }
    throw err
  }

  nextTransport.closed.finally(() => {
    if (transport === nextTransport) {
      transport = null
    }
  })

  return nextTransport
}

function shouldPinLocalCertificate(transportUrl: string) {
  const hostname = new URL(transportUrl).hostname
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "penguin.linux.test" ||
    hostname === "linux.test"
  ) {
    return true
  }

  const octets = hostname.split(".").map(Number)
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false
  }

  const secondOctet = octets[1]
  return octets[0] === 100 && secondOctet !== undefined && secondOctet >= 64 && secondOctet <= 127
}

function hexToU8(hex: string): Uint8Array<ArrayBuffer> {
  const clean = hex.replace(/\s|:/g, "")
  const arr = new Uint8Array(new ArrayBuffer(clean.length / 2))
  for (let i = 0; i < clean.length; i += 2) {
    arr[i / 2] = parseInt(clean.substr(i, 2), 16)
  }
  return arr
}
