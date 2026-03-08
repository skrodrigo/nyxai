import { cn } from '@/lib/utils';
import { LoadingDots } from '@/components/loading-dots';
import type { HTMLAttributes } from 'react';

export type LoaderProps = HTMLAttributes<HTMLDivElement> & {
  size?: number;
};

export const Loader = ({ className, size = 16, ...props }: LoaderProps) => (
  <div
    className={cn(
      'inline-flex items-center justify-center',
      className
    )}
    {...props}
  >
    <LoadingDots size={5} />
  </div>
);
