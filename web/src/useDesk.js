import { useEffect, useState } from 'react';

// The desk's state, kept live by the server's event stream. Falls back to a
// plain fetch every few seconds if the stream can't be opened.
export function useDesk() {
  const [desk, setDesk] = useState(null);
  const [live, setLive] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let poll;
    const accept = (text) => {
      const data = JSON.parse(text);
      if (data.error) {
        setError(data);
        setDesk(null);
      } else {
        setError(null);
        setDesk(data);
      }
    };
    const fetchOnce = () =>
      fetch('/api/desk')
        .then((r) => r.text())
        .then(accept)
        .catch(() => setError({ error: 'offline', message: 'The desk API is not running. Start it with `npm run dev` in web/.' }));

    // `?static` loads once with no live stream: for screenshots and printing.
    if (new URLSearchParams(location.search).has('static')) {
      fetchOnce();
      return undefined;
    }

    const source = new EventSource('/api/stream');
    source.addEventListener('desk', (e) => {
      setLive(true);
      accept(e.data);
    });
    source.onerror = () => {
      setLive(false);
      if (!poll) {
        fetchOnce();
        poll = setInterval(fetchOnce, 5000);
      }
    };
    source.onopen = () => {
      setLive(true);
      clearInterval(poll);
      poll = undefined;
    };
    return () => {
      source.close();
      clearInterval(poll);
    };
  }, []);

  return { desk, live, error };
}

export const STATES = ['shipped', 'accepted risk', 'in review', 'open'];

export function countStates(rows) {
  const c = Object.fromEntries(STATES.map((s) => [s, 0]));
  for (const r of rows) c[r.state] += 1;
  return c;
}

export const slug = (state) => state.replace(' ', '-');
