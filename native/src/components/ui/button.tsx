import * as React from "react";
import { ActivityIndicator, Pressable } from "react-native";
import { TextClassContext } from "@/components/ui/text";
import { cn } from "@/lib/utils";

type ButtonVariant =
  | "default"
  | "destructive"
  | "outline"
  | "secondary"
  | "ghost"
  | "link"
  | "pill";

type ButtonSize = "default" | "sm" | "lg" | "icon";

const BASE_BUTTON =
  "group flex items-center justify-center rounded-md web:ring-offset-background web:transition-colors web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring web:focus-visible:ring-offset-2";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  default: "bg-primary web:hover:opacity-90 active:opacity-90",
  destructive: "bg-destructive web:hover:opacity-90 active:opacity-90",
  outline:
    "border border-input bg-background web:hover:bg-accent web:hover:text-accent-foreground active:bg-accent",
  secondary: "bg-secondary web:hover:opacity-80 active:opacity-80",
  ghost:
    "web:hover:bg-accent web:hover:text-accent-foreground active:bg-accent",
  link: "web:underline-offset-4 web:hover:underline web:focus:underline",
  pill: "text-primary-foreground rounded-full bg-black web:hover:opacity-90 active:opacity-90",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  default: "h-10 px-4 py-2 native:h-12 native:px-5",
  sm: "h-9 rounded-md px-3",
  lg: "h-11 rounded-md px-8 native:h-14",
  icon: "h-10 w-10",
};

const BUTTON_TEXT_VARIANTS: Record<ButtonVariant, string> = {
  default: "text-primary-foreground",
  destructive: "text-destructive-foreground",
  outline: "group-active:text-accent-foreground",
  secondary: "text-secondary-foreground group-active:text-secondary-foreground",
  ghost: "group-active:text-accent-foreground",
  link: "text-primary group-active:underline",
  pill: "text-primary-foreground",
};

const BUTTON_TEXT_SIZES: Record<ButtonSize, string> = {
  default: "",
  sm: "",
  lg: "native:text-lg",
  icon: "",
};

function buttonVariants({
  variant = "default",
  size = "default",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  return cn(BASE_BUTTON, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className);
}

function buttonTextVariants({
  variant = "default",
  size = "default",
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return cn(
    "web:whitespace-nowrap text-sm native:text-base font-medium text-foreground web:transition-colors",
    BUTTON_TEXT_VARIANTS[variant],
    BUTTON_TEXT_SIZES[size],
  );
}

type ButtonProps = React.ComponentPropsWithoutRef<typeof Pressable> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
};

const Button = React.forwardRef<React.ElementRef<typeof Pressable>, ButtonProps>(
  ({ className, variant = "default", size = "default", isLoading, children, ...props }, ref) => {
    return (
      <TextClassContext.Provider
        value={cn(
          props.disabled && "web:pointer-events-none",
          buttonTextVariants({ variant, size }),
        )}
      >
        <Pressable
          className={cn(
            props.disabled && "opacity-50 web:pointer-events-none",
            isLoading && "web:pointer-events-none",
            buttonVariants({ variant, size, className }),
          )}
          ref={ref}
          role="button"
          {...props}
        >
          {isLoading ? (
            <ActivityIndicator color={variant === "outline" ? "black" : "white"} />
          ) : (
            children
          )}
        </Pressable>
      </TextClassContext.Provider>
    );
  },
);

Button.displayName = "Button";

export { Button, buttonTextVariants, buttonVariants };
export type { ButtonProps, ButtonSize, ButtonVariant };
