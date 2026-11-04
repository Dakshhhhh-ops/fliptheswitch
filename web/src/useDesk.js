import { useEffect, useState } from 'react';
import { API, SNAPSHOT } from './lib/snapshot.js';

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
      fetch(API.desk)
        .then((r) => r.text())
        .then(accept)
        .catch(() =>
          setError(
            SNAPSHOT
              ? { error: 'offline', message: 'This snapshot is missing its data file (api/desk.json). Run `npm run export` in web/ again.' }
              : { error: 'offline', message: 'The desk API is not running. Start it with `npm run dev` in web/.' },
          ),
        );

    // A snapshot has no stream to open. `?static` loads once with no live
    // stream too: for screenshots and printing.
    if (SNAPSHOT || new URLSearchParams(location.search).has('static')) {
      fetchOnce();
      return undefined;
    }

    const source = new EventSource(API.stream);
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
