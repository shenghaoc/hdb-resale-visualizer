import { useEffect, useRef } from "react";
import type * as echartsCore from "echarts/core";

type EChartsInstance = ReturnType<typeof echartsCore.init>;

export function EChart({
  echarts,
  option,
  ...divProps
}: {
  echarts: typeof echartsCore;
  option: Record<string, unknown>;
} & React.ComponentProps<"div">) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<EChartsInstance | null>(null);

  useEffect(() => {
    const container = containerRef.current!;
    instanceRef.current = echarts.init(container);

    const ro = new ResizeObserver(() => instanceRef.current?.resize());
    ro.observe(container);

    return () => {
      ro.disconnect();
      instanceRef.current?.dispose();
      instanceRef.current = null;
    };
  }, [echarts]);

  useEffect(() => {
    instanceRef.current?.setOption(option, true);
  }, [option]);

  return <div ref={containerRef} {...divProps} />;
}
