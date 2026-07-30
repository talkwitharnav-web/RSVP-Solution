import { type RefObject, useEffect, useEffectEvent, useRef } from "react";

type InfiniteScrollOptions = {
  enabled: boolean;
  loading: boolean;
  onLoadMore: () => void;
  rootRef?: RefObject<Element | null>;
  rootMargin?: string;
};

export function useInfiniteScroll({
  enabled,
  loading,
  onLoadMore,
  rootRef,
  rootMargin = "480px 0px",
}: InfiniteScrollOptions) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadMore = useEffectEvent(onLoadMore);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!enabled || loading || !sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) loadMore();
      },
      {
        root: rootRef?.current ?? null,
        rootMargin,
        threshold: 0,
      },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [enabled, loading, rootMargin, rootRef]);

  return sentinelRef;
}