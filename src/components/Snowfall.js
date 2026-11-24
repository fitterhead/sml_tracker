const flakes = Array.from({ length: 26 }, (_, index) => ({
  '--snow-left': `${(index * 37 + 3) % 100}%`,
  '--snow-size': `${2 + (index % 5) * 0.5}px`,
  '--snow-duration': `${16 + (index * 3) % 13}s`,
  '--snow-delay': `${-((index * 7) % 23)}s`,
  '--snow-drift': `${((index % 7) - 3) * 9}px`,
  '--snow-opacity': 0.4 + (index % 4) * 0.1,
}));

export default function Snowfall() {
  return (
    <div className="snowfall" aria-hidden="true">
      {flakes.map((style) => (
        <span className="snowflake" key={style['--snow-left']} style={style} />
      ))}
    </div>
  );
}
