import { execSync } from "child_process"
import { existsSync, mkdirSync, writeFileSync } from "fs"
import { dirname } from "path"

const CERT_PATH = process.env.CERT_PATH
const PRIV_KEY_PATH = process.env.PRIV_KEY_PATH
const CERT_HASH_OUT_PATH = process.env.CERT_HASH_OUT_PATH // e.g. ../vue-client/public/certs/cert-hash.json
const IS_LOCAL = process.env.NODE_ENV !== "production"
const DAYS_VALID = 10
const RENEW_BUFFER_SECONDS = 2 * 86400 // regenerate if expiring within 2 days

export default function ensureLocalCert() {
  if (!IS_LOCAL) return // never touch certs outside local dev

  mkdirSync(dirname(CERT_PATH), { recursive: true })

  let needsRegen = false

  if (!existsSync(CERT_PATH) || !existsSync(PRIV_KEY_PATH)) {
    console.log("No existing cert found, generating one...")
    needsRegen = true
  } else {
    try {
      execSync(`openssl x509 -in "${CERT_PATH}" -noout -checkend ${RENEW_BUFFER_SECONDS}`)
    } catch {
      console.log(`Cert expires within ${RENEW_BUFFER_SECONDS / 86400} days, regenerating...`)
      needsRegen = true
    }
  }

  if (!needsRegen) {
    console.log("Existing cert still valid, skipping regeneration.")
    return
  }

  execSync(
    `openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 ` +
      `-keyout "${PRIV_KEY_PATH}" -out "${CERT_PATH}" -days ${DAYS_VALID} -nodes -subj "/CN=localhost"`,
  )

  const hashHex = execSync(
    `openssl x509 -in "${CERT_PATH}" -outform der | openssl dgst -sha256 -binary | xxd -p -c 256`,
  )
    .toString()
    .trim()

  if (CERT_HASH_OUT_PATH) {
    mkdirSync(dirname(CERT_HASH_OUT_PATH), { recursive: true })
    writeFileSync(
      CERT_HASH_OUT_PATH,
      JSON.stringify({ algorithm: "sha256", hashHex, generatedAt: new Date().toISOString() }, null, 2),
    )
  }

  console.log(`Cert regenerated, valid ${DAYS_VALID} days.`)
}
