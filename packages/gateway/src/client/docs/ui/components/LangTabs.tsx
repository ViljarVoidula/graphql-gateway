import React, { useState } from 'react';

export const LangTabs: React.FC<{ languages: string[]; children: React.ReactNode[] }> = ({ languages, children }) => {
  const [idx, setIdx] = useState(0);
  return (
    <div className="lang-tabs">
      <div className="lang-tab-row">
        {languages.map((l, i) => (
          <button key={l} onClick={() => setIdx(i)} className={i === idx ? 'active' : ''}>
            {l}
          </button>
        ))}
      </div>
      <div className="lang-tab-content">{children[idx]}</div>
    </div>
  );
};
