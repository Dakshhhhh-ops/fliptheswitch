// cbom-scan: ignore-file (scanner benchmark: each line says what the scanner should report)
import crypto from 'node:crypto';

// We used to call createHash('sha1') here; now it is SHA-256.
export const h = (b) => crypto.createHash('sha256').update(b).digest(); // expect: none
export const help = 'Set the algorithm to RS256 if you still need RSA tokens.'; // expect: none
export const warn = () => console.log('sha1 and md5 are broken'); // expect: none
export const rsaKeyCount = 3; // expect: none
export const ecdsaDocsUrl = 'https://example.com/docs/ecdsa-migration'; // expect: none
export const msg = (x) => `the ${x} md5 column is legacy`; // expect: none
/*
 * crypto.createCipheriv('des-ede3-cbc', k, iv) was removed in v2.
 */
export const ok = (k, iv) => crypto.createCipheriv('chacha20-poly1305', k, iv, { authTagLength: 16 }); // expect: none
