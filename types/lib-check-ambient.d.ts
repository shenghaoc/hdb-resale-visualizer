import type * as React from "react";

/**
 * echarts-for-react references global `JSX` in its public .d.ts; React 19 typings
 * expose element types under `React.JSX`. This bridges them for skipLibCheck:false.
 */
declare global {
  namespace JSX {
    type Element = React.ReactElement;
  }
}

export {};
