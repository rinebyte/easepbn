import { cn } from '@/lib/utils'

interface SliderProps {
  value: number[]
  onValueChange: (value: number[]) => void
  min?: number
  max?: number
  step?: number
  className?: string
}

function Slider({ value, onValueChange, min = 0, max = 100, step = 1, className }: SliderProps) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value[0] ?? min}
      onChange={(e) => onValueChange([parseInt(e.target.value)])}
      className={cn(
        'h-2 w-full cursor-pointer appearance-none rounded-lg bg-secondary accent-primary',
        className
      )}
    />
  )
}

export { Slider }
