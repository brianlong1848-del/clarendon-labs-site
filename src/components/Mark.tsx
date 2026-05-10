type Props = { size?: number; className?: string }

export default function Mark({ size = 18, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      className={className}
    >
      <rect width="64" height="64" rx="14" fill="currentColor" />
      <path
        d="M44 22.5c-2.6-3-6.5-4.8-10.7-4.8C25.4 17.7 19 24.1 19 32s6.4 14.3 14.3 14.3c4.2 0 8.1-1.8 10.7-4.8"
        stroke="#ffffff"
        strokeWidth="6.2"
        strokeLinecap="square"
        fill="none"
      />
    </svg>
  )
}
