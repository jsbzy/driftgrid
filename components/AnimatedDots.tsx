'use client';

import { useState, useEffect } from 'react';

export function AnimatedDots() {
  const [count, setCount] = useState(1);

  useEffect(() => {
    const id = setInterval(() => setCount(c => (c % 3) + 1), 400);
    return () => clearInterval(id);
  }, []);

  return (
    <span style={{ display: 'inline-block', width: '1.2em', textAlign: 'left' }}>
      {'.'.repeat(count)}
    </span>
  );
}
