import { useCallback, useState } from 'react'

const ACCEPT = '.csv,.xlsx'
const ALLOWED_TYPES = ['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']

export type FileDropZoneProps = {
  value: File | null
  onChange: (file: File | null) => void
  disabled?: boolean
}

export default function FileDropZone({ value, onChange, disabled }: FileDropZoneProps) {
  const [dragging, setDragging] = useState(false)

  const validate = useCallback((file: File): string | null => {
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext !== 'csv' && ext !== 'xlsx') return 'Only .csv and .xlsx files are allowed.'
    if (!ALLOWED_TYPES.includes(file.type) && file.type !== '') return 'Invalid file type.'
    return null
  }, [])

  const handleFile = useCallback(
    (file: File | null) => {
      if (!file) {
        onChange(null)
        return
      }
      const err = validate(file)
      if (err) return
      onChange(file)
    },
    [onChange, validate]
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      if (disabled) return
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    [disabled, handleFile]
  )

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(true)
  }, [])

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
  }, [])

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0] ?? null
      handleFile(file)
      e.target.value = ''
    },
    [handleFile]
  )

  return (
    <label
      className={`
        block cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors
        ${disabled ? 'cursor-not-allowed bg-slate-100' : 'bg-white hover:border-slate-400'}
        ${dragging && !disabled ? 'border-slate-500 bg-slate-50' : 'border-slate-300'}
      `}
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
        <p className="text-sm font-medium text-slate-700">{value.name}</p>
      ) : (
        <p className="text-sm text-slate-600">
          Drag and drop your catalogue here, or <span className="text-slate-800 underline">browse</span>
        </p>
      )}
      <p className="mt-1 text-xs text-slate-500">CSV or Excel (.xlsx)</p>
    </label>
  )
}
