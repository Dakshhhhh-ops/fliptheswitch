// Runs before scan, test, judge and board: stop early, with the fix, on a Node
// that can't run the desk, instead of failing halfway with a crypto error.
// The desk needs ML-KEM-768 and ML-DSA-65 from node:crypto (Node 24.7+).
import { generateKeyPairSync } from 'node:crypto';

export function nodeProblem(version = process.versions.node, hasPq = pqAvailable) {
  const [major, minor] = version.split('.').map(Number);
  if (major < 24 || (major === 24 && minor < 7)) {
    return `Node ${version} is too old: the desk needs Node 24.7 or later for ML-KEM and ML-DSA.`;
  }
  if (!hasPq()) return `Node ${version} has no ML-KEM or ML-DSA in node:crypto (it needs OpenSSL 3.5, as in the official Node 24.7+ builds).`;
  return null;
}

function pqAvailable() {
  try {
    generateKeyPairSync('ml-dsa-65');
    generateKeyPairSync('ml-kem-768');
    return true;
  } catch {
    return false;
  }
}

if (process.argv[1]?.endsWith('need-node.mjs')) {
  const problem = nodeProblem();
  if (problem) {
    console.error(`\n${problem}\nFix: install Node 24 LTS from https://nodejs.org, then run the command again.\n`);
    process.exit(1);
  }
}
