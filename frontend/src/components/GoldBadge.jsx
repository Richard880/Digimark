export default function GoldBadge({ className = "", size = 48 }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${className}`}
      title="Gold Badge"
      aria-label="Gold Badge"
      role="img"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 512 512"
        fill="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="gold-badge-fill" x1="100" y1="100" x2="420" y2="430">
            <stop offset="0%" stopColor="#FFF4A8" />
            <stop offset="45%" stopColor="#D9B84C" />
            <stop offset="100%" stopColor="#A87812" />
          </linearGradient>
          <linearGradient id="gold-badge-edge" x1="120" y1="90" x2="400" y2="440">
            <stop offset="0%" stopColor="#FFF3A6" />
            <stop offset="100%" stopColor="#A17412" />
          </linearGradient>
          <path
            id="gold-badge-top-arc"
            d="M 105 255 A 151 151 0 0 1 407 255"
          />
        </defs>

        <circle
          cx="256"
          cy="256"
          r="198"
          fill="url(#gold-badge-fill)"
          stroke="url(#gold-badge-edge)"
          strokeWidth="12"
        />
        <circle
          cx="256"
          cy="256"
          r="174"
          fill="none"
          stroke="#FFF0A0"
          strokeWidth="4"
        />

        <text
          fill="#76530C"
          fontFamily="Arial, Helvetica, sans-serif"
          fontSize="43"
          fontWeight="700"
          letterSpacing="1"
        >
          <textPath href="#gold-badge-top-arc" startOffset="50%" textAnchor="middle">
            Gold Badge
          </textPath>
        </text>

        <text
          x="256"
          y="390"
          textAnchor="middle"
          fill="#76530C"
          fontFamily="Arial, Helvetica, sans-serif"
          fontSize="47"
          fontWeight="700"
          letterSpacing="2"
        >
          Trust
        </text>

        <circle cx="99" cy="265" r="9" fill="#E4C451" />
        <circle cx="413" cy="265" r="9" fill="#B88B20" />

        <path
          d="M196 267l48 47 96-107a14 14 0 0 1 21 18L254 351a14 14 0 0 1-20 1l-58-57a14 14 0 0 1 20-28Z"
          fill="#76530C"
        />
      </svg>
    </span>
  );
}
