import React, { useState, useRef, useEffect } from 'react'
import './CustomSelect.css'

interface CustomSelectProps {
  options: Array<string | { value: string; label: string }>
  value: string
  placeholder?: string
  onChange: (value: string) => void
  id?: string
}

const CustomSelect: React.FC<CustomSelectProps> = ({ options, value, placeholder, onChange, id }) => {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  const selectedLabel = options.find((opt) => (typeof opt === 'string' ? opt : opt.value) === value)
  const selectedText = typeof selectedLabel === 'string'
    ? selectedLabel
    : selectedLabel
      ? selectedLabel.label
      : (value || placeholder || 'Виберіть')

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const handleSelect = (opt: string) => {
    onChange(opt)
    setOpen(false)
  }

  return (
    <div className="custom-select" ref={ref} id={id}>
      <button
        type="button"
        className={`custom-select-trigger ${open ? 'open' : ''}`}
        onClick={() => setOpen((s) => !s)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="selected-text">{selectedText}</span>
        <span className="caret">▾</span>
      </button>

      {open && (
        <ul className="custom-select-options" role="listbox">
          {options.map((opt) => {
            const optionValue = typeof opt === 'string' ? opt : opt.value
            const optionLabel = typeof opt === 'string' ? opt : opt.label
            return (
            <li
              key={optionValue}
              role="option"
              aria-selected={optionValue === value}
              className={`custom-select-option ${optionValue === value ? 'selected' : ''}`}
              onClick={() => handleSelect(optionValue)}
            >
              {optionLabel}
            </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default CustomSelect
