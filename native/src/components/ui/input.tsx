import * as React from "react";
import { TextInput } from "react-native";
import { cn } from "@/lib/utils";

type InputProps = React.ComponentPropsWithoutRef<typeof TextInput> & {
  className?: string;
  noFocus?: boolean;
  placeholderClassName?: string;
};

const Input = React.forwardRef<React.ElementRef<typeof TextInput>, InputProps>(
  ({ className, placeholderClassName: _placeholderClassName, noFocus: _noFocus, ...props }, ref) => {
    return (
      <TextInput
        ref={ref}
        className={cn(
          "native:h-12 native:text-md native:leading-[1.25] h-10 rounded-md border border-input bg-background px-3 text-base text-foreground placeholder:text-muted-foreground",
          props.editable === false && "opacity-50",
          className,
        )}
        {...props}
      />
    );
  },
);

Input.displayName = "Input";

export { Input };
