import { Command } from "cmdk";
import { ArrowRight, LogOut, Moon, Sun } from "lucide-react";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { TABS, type TabKey } from "@/features/shell/TopBar";
import { addDaysISO, dayNumberFor, formatDate, todayISO } from "@/lib/date";
import { cn } from "@/lib/utils";
import { useApp } from "@/store/app";
import { useTheme } from "@/theme";

const MAX_DAY_ITEMS = 120;

export function CommandPalette({
  open,
  onOpenChange,
  onNavigate,
  onJumpToDay,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (tab: TabKey) => void;
  onJumpToDay: (day: number) => void;
}) {
  const { user, signOut } = useApp();
  const { theme, toggle } = useTheme();

  const today = todayISO();
  const currentDay = user ? dayNumberFor(today, user.start_date) : 0;
  const dayItems =
    user && currentDay > 0
      ? Array.from({ length: Math.min(currentDay, MAX_DAY_ITEMS) }, (_, i) => currentDay - i)
      : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showClose={false} className="max-w-xl overflow-hidden p-0">
        <Command
          label="Command palette"
          loop
          className={cn(
            "flex max-h-[70vh] flex-col [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5",
            "[&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium",
            "[&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider",
            "[&_[cmdk-group-heading]]:text-fg-subtle",
          )}
        >
          <Command.Input
            autoFocus
            placeholder="Type a command, or search a day…"
            className="h-12 w-full border-b border-border bg-transparent px-4 text-sm text-fg outline-none placeholder:text-fg-subtle"
          />
          <Command.List className="overflow-y-auto p-1.5">
            <Command.Empty className="px-3 py-6 text-center text-[13px] text-fg-muted">
              No results found.
            </Command.Empty>

            <Command.Group heading="Navigate">
              {TABS.map((item) => (
                <PaletteItem
                  key={item.value}
                  value={item.label}
                  onSelect={() => {
                    onNavigate(item.value);
                    onOpenChange(false);
                  }}
                >
                  <item.icon className="size-4 text-fg-subtle" aria-hidden="true" />
                  {item.label}
                </PaletteItem>
              ))}
            </Command.Group>

            <Command.Separator className="my-1 h-px bg-border" />

            <Command.Group heading="Actions">
              <PaletteItem
                value="Toggle theme"
                onSelect={() => {
                  toggle();
                  onOpenChange(false);
                }}
              >
                {theme === "dark" ? (
                  <Sun className="size-4 text-fg-subtle" aria-hidden="true" />
                ) : (
                  <Moon className="size-4 text-fg-subtle" aria-hidden="true" />
                )}
                Toggle theme
              </PaletteItem>
              <PaletteItem
                value="Sign out"
                onSelect={() => {
                  onOpenChange(false);
                  void signOut();
                }}
              >
                <LogOut className="size-4 text-fg-subtle" aria-hidden="true" />
                Sign out
              </PaletteItem>
            </Command.Group>

            {dayItems.length > 0 ? (
              <>
                <Command.Separator className="my-1 h-px bg-border" />
                <Command.Group heading="Jump to day">
                  {dayItems.map((day) => {
                    const date = addDaysISO(today, day - currentDay);
                    return (
                      <PaletteItem
                        key={day}
                        value={`Day ${day} ${formatDate(date)}`}
                        onSelect={() => {
                          onJumpToDay(day);
                          onOpenChange(false);
                        }}
                      >
                        <ArrowRight className="size-4 text-fg-subtle" aria-hidden="true" />
                        <span className="font-medium text-fg">Day {day}</span>
                        <span className="text-fg-subtle">{formatDate(date)}</span>
                      </PaletteItem>
                    );
                  })}
                </Command.Group>
              </>
            ) : null}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function PaletteItem({
  children,
  ...props
}: React.ComponentProps<typeof Command.Item>) {
  return (
    <Command.Item
      className={cn(
        "flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-fg outline-none",
        "data-[selected=true]:bg-surface-2 data-[selected=true]:text-fg",
      )}
      {...props}
    >
      {children}
    </Command.Item>
  );
}
