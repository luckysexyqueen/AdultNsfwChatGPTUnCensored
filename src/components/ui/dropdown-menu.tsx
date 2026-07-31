import * as React from "react";

interface DropdownMenuContextType {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const DropdownMenuContext = React.createContext<DropdownMenuContextType>({
  open: false,
  setOpen: () => {},
});

function DropdownMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  return (
    <DropdownMenuContext.Provider value={{ open, setOpen }}>
      <div className="relative inline-block">{children}</div>
    </DropdownMenuContext.Provider>
  );
}

function DropdownMenuTrigger({
  asChild,
  children,
  onClick,
}: {
  asChild?: boolean;
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent) => void;
}) {
  const { open, setOpen } = React.useContext(DropdownMenuContext);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(!open);
    onClick?.(e);
  };

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<any>, {
      onClick: handleClick,
    });
  }

  return <button onClick={handleClick}>{children}</button>;
}

function DropdownMenuContent({
  align = "start",
  children,
  className = "",
}: {
  align?: "start" | "center" | "end";
  children: React.ReactNode;
  className?: string;
}) {
  const { open, setOpen } = React.useContext(DropdownMenuContext);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [open, setOpen]);

  if (!open) return null;

  const alignClasses: Record<string, string> = {
    start: "left-0",
    center: "left-1/2 -translate-x-1/2",
    end: "right-0",
  };

  return (
    <div
      ref={ref}
      className={`absolute z-50 mt-1 min-w-[8rem] overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md ${alignClasses[align]} ${className}`}
      style={{ top: "100%" }}
    >
      {children}
    </div>
  );
}

function DropdownMenuItem({
  className = "",
  children,
  onClick,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { setOpen } = React.useContext(DropdownMenuContext);

  return (
    <button
      className={`relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50 ${className}`}
      onClick={(e) => {
        setOpen(false);
        onClick?.(e);
      }}
      {...props}
    >
      {children}
    </button>
  );
}

function DropdownMenuLabel({
  className = "",
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`px-2 py-1.5 text-sm font-semibold ${className}`}
      {...props}
    />
  );
}

function DropdownMenuSeparator({
  className = "",
  ...props
}: React.HTMLAttributes<HTMLHRElement>) {
  return (
    <hr className={`-mx-1 my-1 border-t border-border ${className}`} {...props} />
  );
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
};
