'use client';

interface SelectCellProps {
  thumbnail: string;
  conceptLabel: string;
  versionNumber: number;
  aspectRatio: string;
  onClick: () => void;
}

export function SelectCell({
  thumbnail,
  conceptLabel,
  versionNumber,
  aspectRatio,
  onClick,
}: SelectCellProps) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left outline-none"
    >
      <div
        className="w-full overflow-hidden rounded-sm"
        style={{
          aspectRatio,
          border: '2px solid var(--muted)',
        }}
      >
        <img
          src={thumbnail}
          alt={`${conceptLabel} v${versionNumber}`}
          className="w-full h-full object-cover object-top"
          draggable={false}
        />
      </div>
    </button>
  );
}
