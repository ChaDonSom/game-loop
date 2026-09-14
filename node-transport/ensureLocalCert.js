import "dotenv/config"
import { execSync } from "child_process"
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs"
import { dirname, join } from "path"
import os from "os"

const CERT_PATH = process.env.CERT_PATH
const PRIV_KEY_PATH = process.env.PRIV_KEY_PATH
const CERT_HASH_OUT_PATH = process.env.CERT_HASH_OUT_PATH
const IS_LOCAL = process.env.NODE_ENV !== "production"
const DAYS_VALID = 10
const RENEW_BUFFER_SECONDS = 2 * 86400

export default function ensureLocalCert() {
  if (!IS_LOCAL) return

  mkdirSync(dirname(CERT_PATH), { recursive: true })

  let needsRegen = false

  if (!existsSync(CERT_PATH) || !existsSync(PRIV_KEY_PATH)) {
    console.log("No existing cert found, generating one...")
    needsRegen = true
  } else {
    try {
      execSync(`openssl x509 -in "${CERT_PATH}" -noout -checkend ${RENEW_BUFFER_SECONDS}`)

      // *** NEW: check SANs ***
      const text = execSync(`openssl x509 -in "${CERT_PATH}" -noout -text`).toString()
      const hasLocalhost = text.includes("DNS:localhost")
      const hasPenguin = text.includes("penguin.linux.test")
      if (!hasLocalhost || !hasPenguin) {
        console.log(`Cert missing SANs (has localhost:${hasLocalhost} penguin:${hasPenguin}), regenerating...`)
        needsRegen = true
      }
    } catch {
      console.log(`Cert expires within ${RENEW_BUFFER_SECONDS / 86400} days, regenerating...`)
      needsRegen = true
    }
  }

  if (!needsRegen) {
    console.log("Existing cert still valid, skipping regeneration.")
    return
  }

  // Create openssl config with SANs for BOTH ChromeOS paths
  const tmpDir = os.tmpdir()
  const cnfPath = join(tmpDir, `san-${Date.now()}.cnf`)
  const cnf = `
[req]
distinguished_name=req_distinguished_name
x509_extensions=v3_req
prompt=no
[req_distinguished_name]
CN=localhost
[v3_req]
subjectAltName=@alt_names
keyUsage=digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
basicConstraints=CA:FALSE
[alt_names]
DNS.1=localhost
DNS.2=penguin.linux.test
IP.1=127.0.0.1
IP.2=::1
`
  writeFileSync(cnfPath, cnf)

  execSync(
    `openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 ` +
      `-keyout "${PRIV_KEY_PATH}" -out "${CERT_PATH}" -days ${DAYS_VALID} -nodes ` +
      `-config "${cnfPath}" -extensions v3_req`,
  )

  const hashHex = execSync(
    `openssl x509 -in "${CERT_PATH}" -outform der | openssl dgst -sha256 -binary | xxd -p -c 256`,
  )
    .toString()
    .trim()

  // Also generate base64 for easier debugging
  const hashB64 = execSync(`openssl x509 -in "${CERT_PATH}" -outform der | openssl dgst -sha256 -binary | base64`)
    .toString()
    .trim()

  if (CERT_HASH_OUT_PATH) {
    mkdirSync(dirname(CERT_HASH_OUT_PATH), { recursive: true })
    writeFileSync(
      CERT_HASH_OUT_PATH,
      JSON.stringify(
        {
          algorithm: "sha-256", // fixed to match WebTransport spec
          hashHex,
          hashB64,
          generatedAt: new Date().toISOString(),
          hosts: ["localhost", "penguin.linux.test"],
        },
        null,
        2,
      ),
    )
    console.log(`Wrote hash to ${CERT_HASH_OUT_PATH}`)
  }

  console.log(`Cert regenerated, valid ${DAYS_VALID} days for localhost + penguin.linux.test`)
  console.log(`B64 hash for manual use: ${hashB64}`)
}
