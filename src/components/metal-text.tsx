import type { ComponentProps } from "react";
import { MetalText as MetalTextEffect } from "metal-fx";

export function MetalText(props: ComponentProps<typeof MetalTextEffect>) {
  return (
    <span className="inline-flex [&>.metal-fx-root]:!visible [&>.metal-fx-root]:!opacity-100">
      <MetalTextEffect {...props} />
    </span>
  );
}
