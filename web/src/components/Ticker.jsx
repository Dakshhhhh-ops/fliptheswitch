// What the desk migrates to, from the PQC rules the agents are briefed with.
const PAIRS = [
  ['RSA-OAEP', 'X25519 + ML-KEM-768'],
  ['ECDH P-256', 'X25519 + ML-KEM-768'],
  ['ECDSA', 'ML-DSA-65, dual-signed'],
  ['SHA-1', 'SHA3-256'],
  ['AES-128', 'AES-256-GCM'],
  ['TLS P-256', 'X25519MLKEM768'],
];

export default function Ticker() {
  const items = [...PAIRS, ...PAIRS];
  return (
    <div className="ticker" aria-label="Migrations the desk makes">
      <div className="ticker-track">
        {items.map(([from, to], i) => (
          <span className="ticker-item" key={i} aria-hidden={i >= PAIRS.length}>
            <s>{from}</s>
            <span className="arrow">→</span>
            <span>{to}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
