import React from 'react';

interface ProductSkeletonProps {
  layout?: 'grid' | 'list';
}

const ProductSkeleton: React.FC<ProductSkeletonProps> = ({ layout = 'grid' }) => {
  if (layout === 'list') {
    return (
      <article className="bg-surface-container-lowest rounded-lg border border-outline-variant p-4 flex gap-4 items-center">
        {/* Image Skeleton */}
        <div className="w-24 h-24 bg-surface-container rounded border border-outline-variant flex-shrink-0 animate-pulse" />
        
        <div className="flex-grow flex flex-col gap-2">
          {/* Title Skeleton */}
          <div className="w-3/4 h-4 bg-surface-container rounded animate-pulse" />
          <div className="w-1/2 h-4 bg-surface-container rounded animate-pulse" />
          
          {/* Price Skeleton */}
          <div className="w-1/3 h-5 bg-surface-container rounded mt-2 animate-pulse" />
          
          {/* Button Skeleton */}
          <div className="w-[180px] h-9 bg-surface-container rounded-lg mt-1 animate-pulse" />
        </div>
      </article>
    );
  }

  // Grid Layout
  return (
    <article className="bg-surface-container-lowest rounded-xl border border-outline-variant overflow-hidden flex flex-col shadow-sm">
      {/* Image Skeleton */}
      <div className="relative aspect-square bg-surface-container animate-pulse" />

      <div className="p-4 flex flex-col flex-grow gap-3">
        {/* Title Skeleton */}
        <div className="flex flex-col gap-1.5 min-h-[40px]">
          <div className="w-full h-4 bg-surface-container rounded animate-pulse" />
          <div className="w-2/3 h-4 bg-surface-container rounded animate-pulse" />
        </div>

        {/* Stars Skeleton */}
        <div className="w-1/2 h-3 bg-surface-container rounded animate-pulse" />

        <div className="mt-auto flex flex-col gap-2 pt-2">
          {/* Price Skeleton */}
          <div className="w-1/2 h-5 bg-surface-container rounded animate-pulse" />
          
          {/* Button Skeleton */}
          <div className="w-full h-11 bg-surface-container rounded-lg mt-2 animate-pulse" />
        </div>
      </div>
    </article>
  );
};

export default ProductSkeleton;
