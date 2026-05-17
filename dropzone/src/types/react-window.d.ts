declare module 'react-window' {
  import * as React from 'react'
  export type ListChildComponentProps = { index: number; style: React.CSSProperties }
  export const FixedSizeList: React.ComponentType<any>
  export const VariableSizeList: React.ComponentType<any>
  export const FixedSizeGrid: React.ComponentType<any>
}
