import { Toaster as Sonner, toast } from "sonner"
import { CheckCircleIcon, CloseCircleIcon, DangerTriangleIcon, InfoCircleIcon, RefreshIcon } from "@solar-icons/react/linear"
import { useTheme } from "@/hooks/use-theme"

type ToasterProps = React.ComponentProps<typeof Sonner>

// A centred, fully rounded pill that drops in from the top. No borders or
// shadows, like the rest of the page. Width hugs the message (see index.css).
const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme()
  return (
    <Sonner
      theme={resolvedTheme}
      position="top-center"
      offset={16}
      gap={8}
      visibleToasts={3}
      className="toaster group"
      icons={{
        success: <CheckCircleIcon size={20} aria-hidden="true" />,
        info: <InfoCircleIcon size={20} aria-hidden="true" />,
        warning: <DangerTriangleIcon size={20} aria-hidden="true" />,
        error: <CloseCircleIcon size={20} aria-hidden="true" />,
        loading: <RefreshIcon size={20} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />,
        close: <CloseCircleIcon size={16} aria-hidden="true" />,
      }}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:rounded-full group-[.toaster]:border-0 group-[.toaster]:bg-[hsl(var(--toast)/0.92)] group-[.toaster]:px-5 group-[.toaster]:py-3 group-[.toaster]:font-sans group-[.toaster]:text-sm group-[.toaster]:text-foreground group-[.toaster]:shadow-none group-[.toaster]:backdrop-blur-xl",
          title: "group-[.toast]:font-medium",
          description: "group-[.toast]:text-muted-foreground",
          error: "group-[.toaster]:text-[hsl(var(--down))]",
          success: "group-[.toaster]:text-foreground",
          icon: "group-[.toast]:mr-0.5",
          actionButton:
            "group-[.toast]:!rounded-full group-[.toast]:!bg-foreground/10 group-[.toast]:!px-3 group-[.toast]:!text-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  )
}

export { Toaster, toast }
