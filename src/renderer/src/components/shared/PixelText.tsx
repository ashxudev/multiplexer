const CELL = 9;

const FONT: Record<string, number[][]> = {
  // Matching Superset's pixel-art letter style
  S: [[1,1,1],[1,0,0],[1,1,1],[0,0,1],[1,1,1]],
  U: [[1,0,1],[1,0,1],[1,0,1],[1,0,1],[1,1,1]],
  P: [[1,1,1],[1,0,1],[1,1,1],[1,0,0],[1,0,0]],
  E: [[1,1,1],[1,0,0],[1,1,0],[1,0,0],[1,1,1]],
  R: [[1,1,1],[1,0,1],[1,1,0],[1,0,1],[1,0,1]],
  T: [[1,1,1],[0,1,0],[0,1,0],[0,1,0],[0,1,0]],
  M: [[1,0,0,0,1],[1,1,0,1,1],[1,0,1,0,1],[1,0,0,0,1],[1,0,0,0,1]],
  L: [[1,0,0],[1,0,0],[1,0,0],[1,0,0],[1,1,1]],
  I: [[1,1,1],[0,1,0],[0,1,0],[0,1,0],[1,1,1]],
  X: [[1,0,1],[1,0,1],[0,1,0],[1,0,1],[1,0,1]],
  F: [[1,1,1],[1,0,0],[1,1,0],[1,0,0],[1,0,0]],
  O: [[1,1,1],[1,0,1],[1,0,1],[1,0,1],[1,1,1]],
  B: [[1,1,0],[1,0,1],[1,1,0],[1,0,1],[1,1,0]],
  Z: [[1,1,1],[0,0,1],[0,1,0],[1,0,0],[1,1,1]],
  " ": [[0],[0],[0],[0],[0]],
};

function buildPath(text: string): { path: string; width: number } {
  const parts: string[] = [];
  let col = 0;

  for (const char of text) {
    const glyph = FONT[char];
    if (!glyph) continue;

    const w = glyph[0].length;
    for (let row = 0; row < 5; row++) {
      for (let c = 0; c < w; c++) {
        if (glyph[row][c]) {
          const x = (col + c) * CELL;
          const y = row * CELL;
          parts.push(`M${x} ${y}h${CELL}v${CELL}H${x}z`);
        }
      }
    }
    col += w + 1; // 1-cell gap between characters
  }

  return { path: parts.join(""), width: Math.max(0, (col - 1) * CELL) };
}

interface PixelTextProps {
  text: string;
  className?: string;
  style?: React.CSSProperties;
}

export function PixelText({ text, className, style }: PixelTextProps) {
  const { path, width } = buildPath(text);
  const height = 5 * CELL;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      aria-label={text}
    >
      <path d={path} fill="currentColor" />
    </svg>
  );
}
