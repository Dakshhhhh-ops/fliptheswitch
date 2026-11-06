// cbom-scan: ignore-file (scanner benchmark: each line says what the scanner should report)
const crypto = require('crypto');
const { publicEncrypt, createECDH, generateKeyPairSync } = require('node:crypto');
const nodeCrypto = require('crypto');

export function wrap(pub, key) {
  return crypto.publicEncrypt({ key: pub, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING }, key); // expect: rsa-oaep
}
export function wrapBare(pub, key) {
  return publicEncrypt(pub, key); // expect: rsa-oaep
}
export const ecdh = createECDH('prime256v1'); // expect: ecdh
export const etag = (b) => crypto.createHash('sha1').update(b).digest('hex'); // expect: sha1
export const legacy = (b) => nodeCrypto.createHash("md5").update(b).digest('hex'); // expect: md5
const ALG = 'sha1';
export const viaConst = (b) => crypto.createHash(ALG).update(b).digest(); // expect: sha1
export const split = (b) => crypto.createHash( // expect: sha1
  'sha1'
).update(b);
export const mac = (k, b) => crypto.createHmac('sha1', k).update(b).digest(); // expect: sha1
export const kdf = (p, s) => crypto.pbkdf2Sync(p, s, 100000, 32, 'sha1'); // expect: sha1
export const enc = (k, iv) => crypto.createCipheriv('aes-128-gcm', k, iv); // expect: aes-128-gcm
export const old = (k, iv) => crypto.createCipheriv('des-ede3-cbc', k, iv); // expect: legacy-cipher
export const rsaPair = () => generateKeyPairSync('rsa', { modulusLength: 2048 }); // expect: rsa-oaep|rsa-sig
export const edPair = () => crypto.generateKeyPairSync('ed25519'); // expect: eddsa
export const xPair = () => crypto.generateKeyPairSync('x25519'); // expect: x25519
export const dh = () => crypto.createDiffieHellman(2048); // expect: ffdh
export const signer = () => crypto.createSign('RSA-SHA256'); // expect: rsa-sig
export const tlsOpts = { ecdhCurve: 'prime256v1', minVersion: 'TLSv1.2' }; // expect: tls-classical

// Fine today: nothing to report.
export const good = (b) => crypto.createHash('sha256').update(b).digest(); // expect: none
export const good2 = (k, iv) => crypto.createCipheriv('aes-256-gcm', k, iv); // expect: none
