import { useState } from "react";
import { CalendarRange, LogOut, Moon, Sun, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { todayISO } from "@/lib/date";
import { tweetAuthor } from "@/lib/user";
import { useApp } from "@/store/app";
import { useTheme } from "@/theme";

export function AccountMenu() {
  const { user, signOut, deleteAccount, saveStartDate } = useApp();
  const { theme, setTheme } = useTheme();
  const [startOpen, setStartOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [startDate, setStartDate] = useState(todayISO());
  const [savingStart, setSavingStart] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  if (!user) return null;
  const author = tweetAuthor(user);

  const onSignOut = async () => {
    await signOut();
    toast.success("Signed out");
  };

  const onSaveStart = async () => {
    setSavingStart(true);
    try {
      await saveStartDate(startDate);
      toast.success("Start date updated");
      setStartOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not update start date");
    } finally {
      setSavingStart(false);
    }
  };

  const onDelete = async () => {
    setDeleting(true);
    try {
      await deleteAccount();
      toast.success("Account deleted");
      setDeleteOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not delete account");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="rounded-full transition-transform duration-150 ease-smooth hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            aria-label="Account menu"
          >
            <Avatar>
              <AvatarFallback>{author.initials}</AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>
            <span className="block truncate normal-case tracking-normal text-fg">{user.email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              setStartDate(user.start_date);
              setStartOpen(true);
            }}
          >
            <CalendarRange />
            Set start date
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Theme</DropdownMenuLabel>
          <DropdownMenuCheckboxItem
            checked={theme === "dark"}
            onCheckedChange={() => setTheme("dark")}
          >
            <Moon className="mr-1.5 size-4 text-fg-subtle" aria-hidden="true" />
            Dark
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={theme === "light"}
            onCheckedChange={() => setTheme("light")}
          >
            <Sun className="mr-1.5 size-4 text-fg-subtle" aria-hidden="true" />
            Light
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void onSignOut()}>
            <LogOut />
            Sign out
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => {
              setConfirmText("");
              setDeleteOpen(true);
            }}
          >
            <Trash2 />
            Delete account
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={startOpen} onOpenChange={setStartOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set your start date</DialogTitle>
            <DialogDescription>
              Day 1 is your start date. Changing it renumbers every existing log.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="start-date">Start date</Label>
            <Input
              id="start-date"
              type="date"
              max={todayISO()}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setStartOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void onSaveStart()} loading={savingStart}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserRound className="size-4 text-danger" aria-hidden="true" />
              Delete your account?
            </DialogTitle>
            <DialogDescription>
              This permanently deletes your account and every log. It cannot be undone. Type{" "}
              <span className="font-mono text-fg">delete</span> to confirm.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="delete"
            aria-label="Type delete to confirm"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void onDelete()}
              loading={deleting}
              disabled={confirmText.trim().toLowerCase() !== "delete"}
            >
              Delete forever
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
