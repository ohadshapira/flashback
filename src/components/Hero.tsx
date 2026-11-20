/**
 * Decorative home-page collage: three tilted prints with tiny original illustrations, a pin and a date sticker.
 * Purely visual (aria-hidden); not connected to any real photos.
 */
function BeachScene() {
  return (
    <svg viewBox="0 0 200 160" className="block h-full w-full" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="h-sky1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5a4a8a" />
          <stop offset=".55" stopColor="#f0707d" />
          <stop offset="1" stopColor="#ffc486" />
        </linearGradient>
      </defs>
      <rect width="200" height="160" fill="url(#h-sky1)" />
      <circle cx="120" cy="92" r="22" fill="#fff1c9" opacity=".95" />
      <rect y="96" width="200" height="30" fill="#e98a7b" opacity=".55" />
      <rect y="108" width="200" height="52" fill="#f1d3a1" />
      <path d="M28 150 C30 120 34 104 40 84" stroke="#4a3a2e" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M40 84 C28 78 18 82 12 92 M40 84 C34 72 46 66 60 70 M40 84 C52 80 62 88 64 98 M40 84 C32 90 30 98 32 106" stroke="#2f6b4a" strokeWidth="5" fill="none" strokeLinecap="round" />
    </svg>
  );
}
function MountainScene() {
  return (
    <svg viewBox="0 0 200 160" className="block h-full w-full" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="h-sky2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7fb2dc" />
          <stop offset="1" stopColor="#eaf3f8" />
        </linearGradient>
      </defs>
      <rect width="200" height="160" fill="url(#h-sky2)" />
      <circle cx="152" cy="34" r="12" fill="#fff6d8" />
      <path d="M0 110 L52 44 L88 88 L124 36 L200 112 L200 160 L0 160Z" fill="#6c7fa3" />
      <path d="M52 44 L66 62 L56 60 L48 68 L40 58Z M124 36 L140 58 L128 55 L118 66 L110 52Z" fill="#fff" />
      <path d="M0 126 C40 112 80 132 120 120 C150 112 180 120 200 118 L200 160 L0 160Z" fill="#4d8a6c" />
      <path d="M0 140 C50 130 90 146 140 136 C170 130 190 136 200 134 L200 160 L0 160Z" fill="#3a6f58" />
    </svg>
  );
}
function CityScene() {
  const wins = [[30, 70], [30, 86], [46, 62], [46, 78], [46, 94], [92, 58], [92, 74], [92, 90], [146, 80], [146, 96], [160, 70], [160, 86]];
  return (
    <svg viewBox="0 0 200 160" className="block h-full w-full" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="h-sky3" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#23304f" />
          <stop offset="1" stopColor="#e07a6a" />
        </linearGradient>
      </defs>
      <rect width="200" height="160" fill="url(#h-sky3)" />
      <circle cx="40" cy="36" r="9" fill="#ffe7b8" />
      <rect x="20" y="62" width="40" height="98" fill="#1d2640" />
      <rect x="70" y="48" width="44" height="112" fill="#273257" />
      <rect x="124" y="74" width="28" height="86" fill="#1d2640" />
      <rect x="152" y="62" width="34" height="98" fill="#273257" />
      {wins.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="8" height="6" rx="1" fill="#ffd98a" opacity=".9" />
      ))}
    </svg>
  );
}

function Print({ children, caption, className, style }: { children: React.ReactNode; caption: string; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`polaroid absolute w-[46%] animate-float ${className ?? ''}`} style={style}>
      <div className="aspect-[5/4] overflow-hidden rounded-[2px] bg-line">{children}</div>
      <span className="absolute inset-x-0 bottom-2 text-center keep-italic font-display text-[11px] italic text-ink/60">{caption}</span>
    </div>
  );
}

export function Hero() {
  return (
    <div aria-hidden className="relative mx-auto h-[300px] w-full max-w-[440px] select-none sm:h-[380px] lg:h-[440px]">
      <div className="absolute inset-x-0 -inset-y-6 rounded-full bg-gradient-to-br from-rose/25 via-apricot/25 to-blue/20 blur-3xl" />
      <Print className="start-[2%] top-[20%]" style={{ ['--r' as string]: '-9deg', transform: 'rotate(-9deg)', animationDelay: '-1s' }} caption="summer ’22">
        <BeachScene />
      </Print>
      <Print className="end-[2%] top-[2%] z-10" style={{ ['--r' as string]: '7deg', transform: 'rotate(7deg)', animationDelay: '-3s' }} caption="the big hike">
        <MountainScene />
      </Print>
      <Print className="start-[27%] top-[50%] z-20" style={{ ['--r' as string]: '-2deg', transform: 'rotate(-2deg)', animationDelay: '-5s' }} caption="that night out">
        <CityScene />
      </Print>
      {/* pin + date sticker */}
      <svg viewBox="0 0 38 50" className="absolute end-[14%] top-[44%] z-30 h-14 w-11 drop-shadow-[0_8px_8px_rgba(120,30,50,0.4)]">
        <defs>
          <linearGradient id="h-pin" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ee6a7d" />
            <stop offset="1" stopColor="#c13a55" />
          </linearGradient>
        </defs>
        <path d="M19 49C19 49 3 30 3 18a16 16 0 0 1 32 0c0 12-16 31-16 31z" fill="url(#h-pin)" stroke="#fff" strokeWidth="2.5" />
        <circle cx="19" cy="18" r="6.2" fill="#fff" />
      </svg>
      <div className="absolute end-[4%] top-[74%] z-30 rotate-3 rounded-2xl border border-white/80 bg-paper px-3.5 py-2 text-sm font-semibold shadow-[0_14px_26px_-12px_rgba(38,26,29,0.55)]">
        <span className="text-muted">Aug</span> <span className="text-rose-deep">2022</span>
      </div>
    </div>
  );
}
