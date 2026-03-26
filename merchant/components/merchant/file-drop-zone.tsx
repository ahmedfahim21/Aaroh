'use client'

import { useCallback, useState } from 'react'
import { cn } from '@/lib/utils'

const ACCEPT = '.csv,.xlsx'
const ALLOWED_TYPES = [
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]

export type FileDropZoneProps = {
  value: File | null
  onChange: (file: File | null) => void
  disabled?: boolean
}

export function FileDropZone({ value, onChange, disabled }: FileDropZoneProps) {
  const [dragging, setDragging] = useState(false)

  const validate = useCallback((file: File): boolean => {
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext !== 'csv' && ext !== 'xlsx') return false
    if (!ALLOWED_TYPES.includes(file.type) && file.type !== '') return false
    return true
  }, [])

  const handleFile = useCallback(
    (file: File | null) => {
      if (!file) { onChange(null); return }
      if (validate(file)) onChange(file)
    },
    [onChange, validate],
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      if (disabled) return
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    [disabled, handleFile],
  )

  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragging(true) }, [])
  const onDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragging(false) }, [])
  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleFile(e.target.files?.[0] ?? null)
      e.target.value = ''
    },
    [handleFile],
  )

  return (
    <label
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed p-8 text-center transition-colors',
        disabled
          ? 'cursor-not-allowed opacity-50'
          : 'hover:border-ring hover:bg-accent/30',
        dragging && !disabled ? 'border-ring bg-accent/30' : 'border-input',
      )}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
    >
      <input
        type="file"
        accept={ACCEPT}
        onChange={onInputChange}
        disabled={disabled}
        className="sr-only"
      />
      {value ? (
        <p className="text-sm font-medium">{value.name}</p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Drag & drop your catalogue, or{' '}
          <span className="text-foreground underline">browse</span>
        </p>
      )}
      <p className="mt-1 text-xs text-muted-foreground">CSV or Excel (.xlsx)</p>
    </label>
  )
}
