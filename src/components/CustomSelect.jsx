import { useState, useRef, useEffect } from 'react'

export default function CustomSelect({
  value,
  onChange,
  options = [],     // [{ value, label }]
  placeholder = 'Select…',
  align = 'left',   // 'left' | 'right' | 'center'
  accentColor = '#f4701b',
  size = 'md',      // 'sm' | 'md' | 'lg'
  style = {},
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function onDown(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const selected = options.find(o => o.value === value)
  const label = selected?.label ?? placeholder

  const fontSize = size === 'lg' ? 18 : size === 'sm' ? 12 : 14
  const padY = size === 'lg' ? '10px 0' : size === 'sm' ? '6px 10px' : '8px 12px'
  const padX = size === 'lg' ? 0 : undefined

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%', ...style }}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%',
          background: 'transparent',
          border: 'none',
          padding: size === 'lg' ? '10px 0' : '8px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start',
          gap: 6,
          cursor: 'pointer',
          color: value ? '#fff' : '#444',
          fontSize,
          fontWeight: value ? 700 : 400,
          fontFamily: 'inherit',
          letterSpacing: size === 'lg' ? 0.3 : 0,
          textAlign: align,
        }}
      >
        <span style={{ flex: 1, textAlign: align, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </span>
        <svg
          width="10" height="6" viewBox="0 0 10 6" fill="none"
          style={{ flexShrink: 0, opacity: 0.4, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}
        >
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          [align === 'right' ? 'right' : 'left']: 0,
          minWidth: '100%',
          width: 'max-content',
          maxWidth: 260,
          background: '#0d0d14',
          border: `1px solid ${accentColor}22`,
          borderRadius: 10,
          boxShadow: `0 16px 40px rgba(0,0,0,0.7), 0 0 0 1px rgba(0,0,0,0.5)`,
          zIndex: 999,
          overflow: 'hidden',
          maxHeight: 320,
          overflowY: 'auto',
        }}>
          {options.map((opt, i) => {
            const isSelected = opt.value === value
            return (
              <button
                key={opt.value ?? i}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false) }}
                style={{
                  width: '100%',
                  background: isSelected ? `${accentColor}18` : 'transparent',
                  border: 'none',
                  borderBottom: i < options.length - 1 ? '1px solid #ffffff08' : 'none',
                  padding: '11px 16px',
                  textAlign: align === 'right' ? 'right' : 'left',
                  color: isSelected ? accentColor : '#ccc',
                  fontSize: 13,
                  fontWeight: isSelected ? 700 : 400,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  letterSpacing: 0.2,
                  transition: 'background 0.1s, color 0.1s',
                }}
                onMouseEnter={e => { if (!isSelected) { e.currentTarget.style.background = '#ffffff08'; e.currentTarget.style.color = '#fff' } }}
                onMouseLeave={e => { if (!isSelected) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#ccc' } }}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
