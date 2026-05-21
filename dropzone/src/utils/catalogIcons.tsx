import React from 'react'
import {
  Gamepad2,
  Joystick,
  KeyRound,
  Crosshair,
  Zap,
  Smartphone,
  MessageCircle,
  Music4,
  Play,
  Monitor,
  FileText,
  Puzzle,
  Dice6,
  Shield,
  type LucideIcon,
} from 'lucide-react'

export type CatalogIconOption = {
  value: string
  label: string
  Icon: LucideIcon
}

export const CATEGORY_ICON_OPTIONS: CatalogIconOption[] = [
  { value: 'gamepad-2', label: 'Ігри', Icon: Gamepad2 },
  { value: 'joystick', label: 'Аркади', Icon: Joystick },
  { value: 'key-round', label: 'Ключі', Icon: KeyRound },
  { value: 'crosshair', label: 'Шутери', Icon: Crosshair },
  { value: 'zap', label: 'Швидкі покупки', Icon: Zap },
  { value: 'smartphone', label: 'Підписки', Icon: Smartphone },
  { value: 'message-circle', label: 'Чати', Icon: MessageCircle },
  { value: 'music4', label: 'Музика', Icon: Music4 },
  { value: 'play', label: 'Відео', Icon: Play },
  { value: 'monitor', label: 'Софт', Icon: Monitor },
  { value: 'file-text', label: 'Офіс', Icon: FileText },
  { value: 'puzzle', label: 'Підбірка', Icon: Puzzle },
  { value: 'dice-6', label: 'Різне', Icon: Dice6 },
  { value: 'shield', label: 'Безпека', Icon: Shield },
]

const CATEGORY_ICON_MAP = new Map(CATEGORY_ICON_OPTIONS.map((option) => [option.value, option.Icon]))
const CATEGORY_ICON_ALIASES: Record<string, string> = {
  '🎮': 'gamepad-2',
  '🕹️': 'joystick',
  '🔑': 'key-round',
  '🔫': 'crosshair',
  '🎯': 'crosshair',
  '⚡': 'zap',
  '📱': 'smartphone',
  '💬': 'message-circle',
  '🎵': 'music4',
  '🎧': 'music4',
  '▶️': 'play',
  '🪟': 'monitor',
  '📄': 'file-text',
  '🧩': 'puzzle',
  '🎲': 'dice-6',
  '🛡️': 'shield',
  '🧱': 'puzzle',
}

export const CATEGORY_ICON_FALLBACK = 'gamepad-2'

export const getCatalogIconOption = (value?: string | null) => {
  if (!value) return null
  const normalized = CATEGORY_ICON_ALIASES[value] || value
  return CATEGORY_ICON_OPTIONS.find((option) => option.value === normalized) || null
}

export const CatalogIconBadge: React.FC<{ value?: string | null; className?: string }> = ({ value, className }) => {
  const iconKey = CATEGORY_ICON_ALIASES[value || ''] || value || CATEGORY_ICON_FALLBACK
  const Icon = CATEGORY_ICON_MAP.get(iconKey)

  if (Icon) {
    return (
      <span className={className} aria-hidden="true">
        <Icon size={16} strokeWidth={2.2} />
      </span>
    )
  }

  return (
    <span className={className} aria-hidden="true">
      {iconKey}
    </span>
  )
}
