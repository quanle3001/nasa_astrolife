import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { MOD, SHORTCUT_GROUPS } from "@/lib/shortcuts";

export function Kbd({ children }: { children: string }) {
  return <kbd className="kbd">{children}</kbd>;
}

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <DialogContent className="w-[min(480px,92vw)] p-6">
          <DialogTitle className="text-xl font-semibold text-space-white">Keyboard shortcuts</DialogTitle>
          <DialogDescription className="mt-2 text-sm leading-6 text-space-muted">
            While you type in a field, only {MOD} shortcuts work.
          </DialogDescription>
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group.title} className="mt-5" aria-label={group.title}>
              <h3 className="text-xs font-semibold tracking-wide text-space-subtle">{group.title}</h3>
              <dl className="mt-2 divide-y divide-white/[.06]">
                {group.items.map((item) => (
                  <div key={item.label} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                    <dt className="text-space-silver">{item.label}</dt>
                    <dd className="flex shrink-0 gap-1">{item.keys.map((key) => <Kbd key={key}>{key}</Kbd>)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </DialogContent>
      )}
    </Dialog>
  );
}
