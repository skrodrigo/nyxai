import * as React from "react";
import { Text } from "react-native";
import { cn } from "@/lib/utils";

type LabelProps = React.ComponentPropsWithoutRef<typeof Text> & {
  className?: string;
};

const Label = React.forwardRef<React.ElementRef<typeof Text>, LabelProps>(
  ({ className, ...props }, ref) => (
    <Text
      ref={ref}
      className={cn(
        "text-sm font-medium leading-none text-foreground",
        className,
      )}
      {...props}
    />
  ),
);

Label.displayName = "Label";

export { Label };
