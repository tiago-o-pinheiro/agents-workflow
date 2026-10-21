import { type ComponentProps } from 'react'

import { cn } from '../lib/cn'

export type SkeletonProps = ComponentProps<'div'>

export const Skeleton = ({ className, ...props }: SkeletonProps) => (
  <div
    aria-hidden="true"
    className={cn('animate-pulse rounded-md bg-muted motion-reduce:animate-none', className)}
    {...props}
  />
)
