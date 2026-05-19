import * as React from "react";
import { Platform, TextInput } from "react-native";
import { cn } from "@/lib/utils";

type ChatTextInputProps = React.ComponentPropsWithoutRef<typeof TextInput> & {
  className?: string;
  noFocus?: boolean;
  autoFocus?: boolean;
  asChild?: boolean;
  placeholderClassName?: string;
};

const ChatTextInput = React.forwardRef<
  React.ElementRef<typeof TextInput>,
  ChatTextInputProps
>(
  (
    {
      className,
      placeholderClassName: _placeholderClassName,
      asChild: _asChild,
      noFocus: _noFocus,
      autoFocus = false,
      ...props
    },
    ref,
  ) => {
    return (
      <TextInput
        ref={ref}
        autoFocus={autoFocus}
        className={cn(
          "native:min-h-6 native:text-md native:leading-6 min-h-6 rounded-md bg-background px-0 py-0 text-base text-foreground placeholder:text-muted-foreground",
          props.editable === false && "opacity-50",
          className,
        )}
        textAlignVertical={Platform.OS === "android" ? "center" : undefined}
        {...props}
      />
    );
  },
);

ChatTextInput.displayName = "ChatTextInput";

export { ChatTextInput };
