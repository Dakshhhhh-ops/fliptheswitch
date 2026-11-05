// cbom-scan: ignore-file (seals a test card with RSA on purpose, for the demo)
// A real specimen for the "harvest now, decrypt later" scene: one test card
// number sealed twice, right now, with node:crypto.
//
//   classical  AES-256-GCM data key wrapped with RSA-2048 OAEP (what demo-payments does today)
//   hybrid     AES-256-GCM data key wrapped with X25519 + ML-KEM-768 through HKDF-SHA-256
//
// Nothing is decrypted for show: the page only reveals the plaintext it was
// given, as an illustration of what Shor's algorithm would allow for RSA.
import {
  constants, createCipheriv, diffieHellman, encapsulate, generateKeyPairSync, hkdfSync, publicEncrypt, randomBytes,
} from 'node:crypto';

const CARD = '4111 1111 1111 1111';

function seal(dataKey) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', dataKey, iv);
  const body = Buffer.concat([c.update(CARD, 'utf8'), c.final(), c.getAuthTag()]);
  return Buffer.concat([iv, body]);
}

export function specimen() {
  const t0 = performance.now();
  const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const dk1 = randomBytes(32);
  const rsaWrapped = publicEncrypt({ key: rsa.publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, dk1);
  const rsaBody = seal(dk1);
  const tRsa = performance.now() - t0;

  const t1 = performance.now();
  const kem = generateKeyPairSync('ml-kem-768');
  const xStatic = generateKeyPairSync('x25519');
  const xEph = generateKeyPairSync('x25519');
  const { sharedKey, ciphertext: kemCt } = encapsulate(kem.publicKey);
  const xShared = diffieHellman({ privateKey: xEph.privateKey, publicKey: xStatic.publicKey });
  const kek = Buffer.from(hkdfSync('sha256', Buffer.concat([xShared, sharedKey]), Buffer.alloc(0), 'crypto-desk specimen v1', 32));
  const dk2 = randomBytes(32);
  const wrapIv = randomBytes(12);
  const w = createCipheriv('aes-256-gcm', kek, wrapIv);
  const wrapped = Buffer.concat([wrapIv, w.update(dk2), w.final(), w.getAuthTag()]);
  const xPub = xEph.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32);
  const hybridBody = seal(dk2);
  const tHybrid = performance.now() - t1;

  return {
    plaintext: CARD,
    madeAt: new Date().toISOString(),
    classical: {
      scheme: 'RSA-2048 OAEP (SHA-256) key wrap + AES-256-GCM',
      parts: [
        { label: 'RSA-OAEP wrapped key', bytes: rsaWrapped.length, hex: rsaWrapped.toString('hex') },
        { label: 'AES-256-GCM ciphertext', bytes: rsaBody.length, hex: rsaBody.toString('hex') },
      ],
      ms: Math.round(tRsa),
    },
    hybrid: {
      scheme: 'X25519 + ML-KEM-768 → HKDF-SHA-256 key wrap + AES-256-GCM',
      parts: [
        { label: 'X25519 ephemeral key', bytes: xPub.length, hex: xPub.toString('hex') },
        { label: 'ML-KEM-768 ciphertext', bytes: kemCt.length, hex: kemCt.toString('hex') },
        { label: 'Wrapped key', bytes: wrapped.length, hex: wrapped.toString('hex') },
        { label: 'AES-256-GCM ciphertext', bytes: hybridBody.length, hex: hybridBody.toString('hex') },
      ],
      ms: Math.round(tHybrid),
    },
  };
}
