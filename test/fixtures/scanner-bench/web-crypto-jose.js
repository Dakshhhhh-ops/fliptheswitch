// cbom-scan: ignore-file (scanner benchmark: each line says what the scanner should report)
import { SignJWT, CompactEncrypt } from 'jose';
import jwt from 'jsonwebtoken';
const { subtle } = globalThis.crypto;

export const wrapKey = (k, d) => subtle.encrypt({ name: 'RSA-OAEP' }, k, d); // expect: rsa-oaep
export const ecKeys = () => subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-384' }, true, ['sign']); // expect: ecdsa
export const agree = (pub, priv) => subtle.deriveBits({ name: 'ECDH', public: pub }, priv, 256); // expect: ecdh
export const token = (p, k) => new SignJWT(p).setProtectedHeader({ alg: 'RS256' }).sign(k); // expect: rsa-sig
export const token2 = (p, k) => jwt.sign(p, k, { algorithm: 'ES256' }); // expect: ecdsa
export const jwe = (p, k) => new CompactEncrypt(p).setProtectedHeader({ alg: 'ECDH-ES+A256KW', enc: 'A256GCM' }).encrypt(k); // expect: ecdh
export const hashWeb = (d) => subtle.digest('SHA-1', d); // expect: sha1
export const good = (d) => subtle.digest('SHA-256', d); // expect: none
export const pqTok = (p, k) => new SignJWT(p).setProtectedHeader({ alg: 'ML-DSA-65' }).sign(k); // expect: none
