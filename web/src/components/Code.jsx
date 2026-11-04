// A small, dependency-free code view: line numbers, strings and comments tinted,
// and chosen lines marked.
const TOKEN = /(\/\/.*$)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)|\b(import|from|export|function|const|let|return|new|if|else)\b/g;

function Line({ text }) {
  const out = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const cls = m[1] ? 'tk-com' : m[2] ? 'tk-str' : 'tk-kw';
    out.push(<span className={cls} key={m.index}>{m[0]}</span>);
    last = m.index + m[0].length;
  }
  out.push(text.slice(last));
  return out;
}

export default function Code({ source, from = 1, to, marks = [] }) {
  if (source == null) return <pre className="code empty">File not on this commit.</pre>;
  const lines = source.split(/\r?\n/);
  const end = Math.min(lines.length, to ?? lines.length);
  const start = Math.max(1, from);
  const marked = new Set(marks);
  return (
    <pre className="code">
      {lines.slice(start - 1, end).map((l, i) => {
        const n = start + i;
        return (
          <span className={`ln ${marked.has(n) ? 'mark' : ''}`} key={n}>
            <i>{n}</i>
            <Line text={l} />
            {'\n'}
          </span>
        );
      })}
    </pre>
  );
}
