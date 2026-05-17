import React, { useRef, useState, useEffect, UIEvent } from 'react'

interface VirtualListProps {
  height: number
  itemCount: number
  itemSize: number
  width?: number | string
  children: (props: { index: number; style: React.CSSProperties }) => React.ReactNode
}

const VirtualList: React.FC<VirtualListProps> = ({ height, itemCount, itemSize, width = '100%', children }) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [scrollTop, setScrollTop] = useState(0)

  const onScroll = (e: UIEvent<HTMLDivElement>) => {
    setScrollTop((e.target as HTMLDivElement).scrollTop)
  }

  const totalHeight = itemCount * itemSize
  const startIndex = Math.max(0, Math.floor(scrollTop / itemSize) - 2)
  const visibleCount = Math.ceil(height / itemSize) + 4
  const endIndex = Math.min(itemCount - 1, startIndex + visibleCount - 1)

  const items = [] as React.ReactNode[]
  for (let i = startIndex; i <= endIndex; i++) {
    const style: React.CSSProperties = {
      position: 'absolute',
      top: i * itemSize,
      height: itemSize,
      width: '100%',
    }
    items.push(
      <div key={i} style={style}>
        {children({ index: i, style })}
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      onScroll={onScroll}
      style={{ width, height, overflow: 'auto', position: 'relative' }}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        {items}
      </div>
    </div>
  )
}

export default VirtualList
