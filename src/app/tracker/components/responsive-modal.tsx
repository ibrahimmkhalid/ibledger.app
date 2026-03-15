"use client";

import type { ReactNode } from "react";

import { buttonVariants } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { XIcon } from "lucide-react";

type RenderArgs = { isMobile: boolean };

export function ResponsiveModal(args: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  desktopContentClassName?: string;
  desktopFooterClassName?: string;
  mobileContentClassName?: string;
  mobileFooterClassName?: string;
  renderBody: (args: RenderArgs) => ReactNode;
  renderFooter?: (args: RenderArgs) => ReactNode;
}) {
  const {
    open,
    onOpenChange,
    title,
    desktopContentClassName,
    desktopFooterClassName,
    mobileContentClassName,
    mobileFooterClassName,
    renderBody,
    renderFooter,
  } = args;

  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent
          className={cn(
            "data-[vaul-drawer-direction=bottom]:max-h-[92vh]",
            mobileContentClassName,
          )}
        >
          <div className="flex max-h-[92vh] flex-col">
            <DrawerHeader className="p-3 pb-2">
              <div className="flex items-start justify-between gap-2">
                <DrawerTitle>{title}</DrawerTitle>
                <DrawerClose
                  className={cn(
                    buttonVariants({ variant: "ghost", size: "icon-sm" }),
                  )}
                >
                  <XIcon />
                  <span className="sr-only">Close</span>
                </DrawerClose>
              </div>
            </DrawerHeader>

            <div className="flex-1 overflow-y-auto px-3 pb-3">
              {renderBody({ isMobile })}
            </div>

            {renderFooter && (
              <DrawerFooter
                className={cn("border-t p-3", mobileFooterClassName)}
              >
                {renderFooter({ isMobile })}
              </DrawerFooter>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={desktopContentClassName}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {renderBody({ isMobile })}

        {renderFooter && (
          <DialogFooter className={desktopFooterClassName}>
            {renderFooter({ isMobile })}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
