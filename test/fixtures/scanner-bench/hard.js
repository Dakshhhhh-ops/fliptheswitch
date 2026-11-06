// cbom-scan: ignore-file (scanner benchmark: each line says what the scanner should report)
// Cases a pattern scanner can't name. The best it can do is flag them for a person.
import crypto from 'node:crypto';
import { HASH } from './config.js';
import forge from 'node-forge';
import NodeRSA from 'node-rsa';
import nacl from 'tweetnacl';
import { ec as EC } from 'elliptic';

export const fromConfig = (b) => crypto.createHash(HASH).update(b).digest(); // expect: review
export const fromEnv = (b) => crypto.createHash(process.env.HASH_ALG).update(b); // expect: review
export const built = (b) => crypto.createHash('sh' + 'a1').update(b); // expect: review
function digest(alg, b) { return crypto.createHash(alg).update(b).digest(); } // expect: review
export const viaWrapper = (b) => digest('sha1', b); // expect: sha1 gap
export const forgePair = () => forge.pki.rsa.generateKeyPair({ bits: 2048 }); // expect: rsa-oaep|rsa-sig
export const nodeRsa = () => new NodeRSA({ b: 2048 }); // expect: rsa-oaep|rsa-sig
export const box = (m, n, pk, sk) => nacl.box(m, n, pk, sk); // expect: x25519
export const naclSign = (m, sk) => nacl.sign(m, sk); // expect: eddsa
export const secp = new EC('secp256k1'); // expect: ecdsa
// A file with a hybrid key exchange is assumed to use X25519 as its classical
// half, so a standalone X25519 in the same file isn't reported.
export const kem = () => crypto.generateKeyPairSync('ml-kem-768'); // expect: none
export const standalone = () => crypto.generateKeyPairSync('x25519'); // expect: x25519 gap
