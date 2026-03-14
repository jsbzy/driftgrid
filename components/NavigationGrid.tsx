'use client';


interface NavigationGridProps {
  conceptIndex: number;
  versionIndex: number;
  versionCounts: number[];
}

export function NavigationGrid({
  conceptIndex,
  versionIndex,
  versionCounts,
}: NavigationGridProps) {
  const conceptCount = versionCounts.length;
  const maxVersions = Math.max(...versionCounts);
  const cell = 12;
  const gap = 4;

  return (
    <div
      className="fixed bottom-14 right-14 z-50"
      style={{ opacity: 0.45 }}
    >
      <div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(${conceptCount}, ${cell}px)`,
          gap: `${gap}px`,
        }}
      >
        {Array.from({ length: maxVersions }, (_, row) =>
          Array.from({ length: conceptCount }, (_, col) => {
            const exists = row < versionCounts[col];
            if (!exists)
              return (
                <div
                  key={`${col}-${row}`}
                  style={{ width: cell, height: cell }}
                />
              );
            const isCurrent = col === conceptIndex && row === versionIndex;
            return (
              <div
                key={`${col}-${row}`}
                style={{
                  width: cell,
                  height: cell,
                  background: isCurrent ? 'var(--foreground)' : undefined,
                  border: isCurrent ? undefined : '1px solid var(--border)',
                }}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
