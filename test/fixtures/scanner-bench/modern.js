// cbom-scan: ignore-file (scanner benchmark: each line says what the scanner should report)
// Post-quantum and hybrid code: nothing to report.
import crypto from 'node:crypto';

export const kem = () => crypto.generateKeyPairSync('ml-kem-768'); // expect: none
export const sig = () => crypto.generateKeyPairSync('ml-dsa-65'); // expect: none
export const half = () => crypto.generateKeyPairSync('x25519'); // expect: none
export const wrap = (pub) => crypto.encapsulate(pub); // expect: none
export const tls = { ecdhCurve: 'X25519MLKEM768:X25519', minVersion: 'TLSv1.3' }; // expect: none
export const mac = (k, b) => crypto.createHmac('sha3-256', k).update(b).digest(); // expect: none
