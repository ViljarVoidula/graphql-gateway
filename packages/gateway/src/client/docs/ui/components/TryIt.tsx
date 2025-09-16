import React, { useState } from 'react';

export const TryIt: React.FC<{ operation?: string; query?: string; variables?: any }> = ({
  operation,
  query = 'query Ping { __typename }',
  variables
}) => {
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/graphql', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query, variables })
      }).then((r) => r.json());
      setResult(res);
    } catch (e: any) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="try-it-box">
      <div className="try-it-head">
        <strong>Try It</strong> {operation && <code>{operation}</code>}
        <button onClick={run} disabled={loading}>
          {loading ? 'Running...' : 'Run'}
        </button>
      </div>
      <pre className="try-it-query">{query}</pre>
      {error && <pre className="try-it-error">{error}</pre>}
      {result && <pre className="try-it-result">{JSON.stringify(result, null, 2)}</pre>}
    </div>
  );
};
