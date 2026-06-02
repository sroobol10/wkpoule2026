import Image from 'next/image'

type Props = {
  username: string
  avatarUrl: string | null | undefined
  size: number          // pixels, e.g. 28
  className?: string
}

export function AvatarCircle({ username, avatarUrl, size, className = '' }: Props) {
  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt={username}
        width={size}
        height={size}
        className={`rounded-full object-cover shrink-0 ${className}`}
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <div
      className={`rounded-full bg-wk-bg2 border border-white/10 flex items-center justify-center shrink-0 font-mono font-bold text-wk-gold ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
    >
      {username.charAt(0).toUpperCase()}
    </div>
  )
}
