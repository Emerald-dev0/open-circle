import { Toaster as Sonner, toast } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

// A centred, fully rounded pill that drops in from the top. No borders or
// shadows, like the rest of the page. Width hugs the message (see index.css).
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      position="top-center"
      offset={16}
      gap={8}
      visibleToasts={3}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:rounded-full group-[.toaster]:border-0 group-[.toaster]:bg-[hsl(218_29%_12%/0.92)] group-[.toaster]:px-5 group-[.toaster]:py-3 group-[.toaster]:font-sans group-[.toaster]:text-sm group-[.toaster]:text-foreground group-[.toaster]:shadow-none group-[.toaster]:backdrop-blur-xl",
          title: "group-[.toast]:font-medium",
          description: "group-[.toast]:text-muted-foreground",
          error: "group-[.toaster]:text-[hsl(var(--down))]",
          success: "group-[.toaster]:text-foreground",
          icon: "group-[.toast]:mr-0.5",
          actionButton:
            "group-[.toast]:!rounded-full group-[.toast]:!bg-white/10 group-[.toast]:!px-3 group-[.toast]:!text-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  )
}

export { Toaster, toast }
